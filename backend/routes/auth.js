const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Send magic link to email
router.post('/magic-link', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const db = req.app.locals.db;
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(403).json({ error: 'Not invited. Contact the admin for an invite.' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

  db.prepare('INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, ?)')
    .run(token, email.toLowerCase().trim(), expiresAt);

  // Send email
  sendMagicLinkEmail(email, token).then(() => {
    res.json({ message: 'Magic link sent. Check your email.' });
  }).catch(err => {
    console.error('Email send failed:', err.message);
    // In dev mode, return the token directly
    if (process.env.NODE_ENV !== 'production') {
      return res.json({ message: 'Magic link generated (dev mode)', token });
    }
    res.status(500).json({ error: 'Failed to send email' });
  });
});

// Verify magic link and create session
router.post('/verify', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const db = req.app.locals.db;
  const link = db.prepare(
    `SELECT email FROM magic_links WHERE token = ? AND used = 0 AND expires_at > datetime('now')`
  ).get(token);

  if (!link) return res.status(401).json({ error: 'Invalid or expired link' });

  // Mark link as used
  db.prepare('UPDATE magic_links SET used = 1 WHERE token = ?').run(token);

  // Find user
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(link.email);
  if (!user) return res.status(403).json({ error: 'User not found' });

  // Update last login
  db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);

  // Create session (30 days)
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sessionToken, user.id, expiresAt);

  res.json({
    token: sessionToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tradition: user.tradition,
      monthSystem: user.month_system,
    },
  });
});

// Get current user profile
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// Update profile
router.patch('/me', requireAuth, (req, res) => {
  const { name, tradition, monthSystem } = req.body;
  const db = req.app.locals.db;

  const updates = [];
  const params = [];
  if (name) { updates.push('name = ?'); params.push(name); }
  if (tradition) { updates.push('tradition = ?'); params.push(tradition); }
  if (monthSystem) { updates.push('month_system = ?'); params.push(monthSystem); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ message: 'Profile updated' });
});

// Logout
router.post('/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  req.app.locals.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ message: 'Logged out' });
});

// --- Admin routes ---

// Create invite (admin creates a user entry)
router.post('/invite', requireAdmin, (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'Email and name required' });

  const db = req.app.locals.db;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'User already exists' });

  const id = uuidv4();
  db.prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)')
    .run(id, email.toLowerCase().trim(), name);

  res.json({ message: `Invited ${name} (${email})`, userId: id });
});

// List users (admin)
router.get('/users', requireAdmin, (req, res) => {
  const users = req.app.locals.db.prepare(
    'SELECT id, email, name, role, tradition, month_system, household_id, created_at, last_login FROM users ORDER BY name'
  ).all();
  res.json(users);
});

// List households (admin)
router.get('/households', requireAdmin, (req, res) => {
  const households = req.app.locals.db.prepare(
    `SELECT household_id, GROUP_CONCAT(name, ', ') as members, COUNT(*) as count
     FROM users WHERE household_id IS NOT NULL
     GROUP BY household_id ORDER BY household_id`
  ).all();
  res.json(households);
});

// Assign user to household (admin)
router.patch('/users/:id/household', requireAdmin, (req, res) => {
  const { householdId } = req.body;
  if (!householdId) return res.status(400).json({ error: 'householdId required' });

  const db = req.app.locals.db;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(householdId, req.params.id);
  res.json({ message: 'Household updated' });
});

// Bootstrap: create admin user with invite code
router.post('/bootstrap', (req, res) => {
  const { code, email, name } = req.body;
  const expectedCode = process.env.ADMIN_INVITE_CODE || 'parampara-admin-2026';

  if (code !== expectedCode) return res.status(403).json({ error: 'Invalid admin code' });

  const db = req.app.locals.db;
  const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (existing) return res.status(409).json({ error: 'Admin already exists' });

  const id = uuidv4();
  db.prepare('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)')
    .run(id, email.toLowerCase().trim(), name, 'admin');

  res.json({ message: 'Admin created. Now use /api/auth/magic-link to sign in.', userId: id });
});

async function sendMagicLinkEmail(email, token) {
  const nodemailer = require('nodemailer');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Parampara" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Sign in to Parampara',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #c85a17;">Parampara</h2>
        <p>Click the link below to sign in. It expires in 15 minutes.</p>
        <a href="${frontendUrl}/auth/verify?token=${token}"
           style="display: inline-block; padding: 12px 24px; background: #c85a17; color: white;
                  text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Sign in to Parampara
        </a>
        <p style="color: #666; font-size: 13px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}

module.exports = router;

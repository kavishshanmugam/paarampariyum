// Load .env before anything else
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const guideRoutes = require('./routes/guide');
const traditionsRoutes = require('./routes/traditions');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Serve uploaded files (requires auth token)
app.use('/api/uploads', (req, res, next) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const db = req.app.locals.db;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired token' });
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Initialize database
const db = initDb();
app.locals.db = db;

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/guide', guideRoutes);
app.use('/api/traditions', traditionsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.listen(PORT, () => {
  console.log(`Parampara backend running on port ${PORT}`);
});

// Session-based auth middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const db = req.app.locals.db;
  const session = db.prepare(
    `SELECT s.user_id, u.email, u.name, u.role, u.tradition, u.month_system, u.household_id
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).get(token);

  if (!session) return res.status(401).json({ error: 'Session expired' });

  req.user = {
    id: session.user_id,
    email: session.email,
    name: session.name,
    role: session.role,
    tradition: session.tradition,
    monthSystem: session.month_system,
    household_id: session.household_id,
  };
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    next();
  });
}

module.exports = { requireAuth, requireAdmin };

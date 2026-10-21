const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// File upload config
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || (file.mimetype.startsWith('audio/') ? '.webm' : '.jpg');
    cb(null, `${uuidv4()}${ext}`);
  },
});

// ponytail: 10MB limit, only image/audio types
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and audio files allowed'));
    }
  },
});

// Get all family notes for current user
router.get('/', requireAuth, (req, res) => {
  const notes = req.app.locals.db.prepare(
    `SELECT * FROM family_notes WHERE user_id = ? ORDER BY observance_id, pinned DESC, created_at DESC`
  ).all(req.user.id);
  res.json(notes);
});

// Get notes for a specific observance
router.get('/:observanceId', requireAuth, (req, res) => {
  const notes = req.app.locals.db.prepare(
    `SELECT * FROM family_notes WHERE user_id = ? AND observance_id = ? ORDER BY pinned DESC, created_at DESC`
  ).all(req.user.id, req.params.observanceId);
  res.json(notes);
});

// Create a note
router.post('/', requireAuth, (req, res) => {
  const { observanceId, content, noteType } = req.body;
  if (!observanceId || !content) {
    return res.status(400).json({ error: 'observanceId and content required' });
  }

  const id = uuidv4();
  req.app.locals.db.prepare(
    'INSERT INTO family_notes (id, user_id, observance_id, content, note_type) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.user.id, observanceId, content, noteType || 'text');

  res.status(201).json({ id, message: 'Note saved' });
});

// Upload a photo or voice note
router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { observanceId, noteType } = req.body;
  if (!observanceId) return res.status(400).json({ error: 'observanceId required' });

  const type = noteType || (req.file.mimetype.startsWith('audio/') ? 'voice' : 'photo');
  const id = uuidv4();
  req.app.locals.db.prepare(
    'INSERT INTO family_notes (id, user_id, observance_id, content, note_type) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.user.id, observanceId, req.file.filename, type);

  res.status(201).json({ id, filename: req.file.filename, noteType: type });
});

// Update a note
router.patch('/:id', requireAuth, (req, res) => {
  const { content, pinned } = req.body;
  const db = req.app.locals.db;

  // Verify ownership
  const note = db.prepare('SELECT id FROM family_notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  const updates = [];
  const params = [];
  if (content !== undefined) { updates.push('content = ?'); params.push(content); }
  if (pinned !== undefined) { updates.push('pinned = ?'); params.push(pinned ? 1 : 0); }
  updates.push("updated_at = datetime('now')");

  params.push(req.params.id);
  db.prepare(`UPDATE family_notes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ message: 'Note updated' });
});

// Delete a note (also removes uploaded file if photo/voice)
router.delete('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const note = db.prepare('SELECT * FROM family_notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  // Clean up file if it's a media note
  if (note.note_type === 'photo' || note.note_type === 'voice') {
    const filePath = path.join(uploadDir, note.content);
    try { fs.unlinkSync(filePath); } catch { /* file may already be gone */ }
  }

  db.prepare('DELETE FROM family_notes WHERE id = ?').run(req.params.id);
  res.json({ message: 'Note deleted' });
});

module.exports = router;

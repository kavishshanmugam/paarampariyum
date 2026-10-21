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

// Serve uploaded files
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

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

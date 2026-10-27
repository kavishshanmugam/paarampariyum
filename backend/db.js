const Database = require('better-sqlite3');
const path = require('path');

function initDb() {
  const db = new Database(path.join(__dirname, 'parampara.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      tradition TEXT DEFAULT 'smarta',
      month_system TEXT DEFAULT 'purnimanta',
      household_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS magic_links (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      created_by TEXT REFERENCES users(id),
      email TEXT,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS family_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      observance_id TEXT NOT NULL,
      content TEXT NOT NULL,
      note_type TEXT DEFAULT 'text',
      scope TEXT DEFAULT 'our_way',
      occurrence_year INTEGER,
      pinned INTEGER DEFAULT 0,
      visibility TEXT DEFAULT 'household',
      household_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS flagged_questions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      question TEXT NOT NULL,
      context TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS guide_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      messages TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrations for existing databases
  const migrations = [
    { col: 'scope', table: 'family_notes', sql: "ALTER TABLE family_notes ADD COLUMN scope TEXT DEFAULT 'our_way'" },
    { col: 'occurrence_year', table: 'family_notes', sql: 'ALTER TABLE family_notes ADD COLUMN occurrence_year INTEGER' },
    { col: 'visibility', table: 'family_notes', sql: "ALTER TABLE family_notes ADD COLUMN visibility TEXT DEFAULT 'household'" },
    { col: 'household_id', table: 'family_notes', sql: 'ALTER TABLE family_notes ADD COLUMN household_id TEXT' },
    { col: 'household_id', table: 'users', sql: 'ALTER TABLE users ADD COLUMN household_id TEXT' },
  ];
  for (const m of migrations) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${m.table})`).all();
      if (!cols.find(c => c.name === m.col)) db.exec(m.sql);
    } catch { /* column already exists */ }
  }

  return db;
}

module.exports = { initDb };

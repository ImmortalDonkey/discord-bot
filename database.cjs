// database.cjs
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'bot.db');

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDataDir();

const db = new sqlite3.Database(
  DB_PATH,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error('❌ Failed to open SQLite DB:', err);
    } else {
      console.log('✅ SQLite DB opened at', DB_PATH);
    }
  }
);

// Promisify helpers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// Helper: ensure a column exists on a table
async function ensureColumn(table, column, definition) {
  const info = await all(`PRAGMA table_info(${table})`);
  const exists = info.some((col) => col.name === column);
  if (!exists) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`📦 Added column ${column} to ${table}`);
  }
}

// Initialize schema
async function init() {
  await run(`CREATE TABLE IF NOT EXISTS points (
    discord_id TEXT PRIMARY KEY,
    username TEXT,
    points INTEGER DEFAULT 0,
    last_updated INTEGER
  )`);

  await run(`CREATE TABLE IF NOT EXISTS point_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT,
    username TEXT,
    points INTEGER,
    reason TEXT,
    timestamp INTEGER
  )`);

  // New columns for lifetime tracking + rank
  await ensureColumn('points', 'lifetime_points', 'INTEGER DEFAULT 0');
  await ensureColumn('points', 'rank_name', 'TEXT');
}

// Get by Discord ID
async function getUserById(discordId) {
  if (!discordId) return null;
  const row = await get(
    `SELECT * FROM points WHERE discord_id = ?`,
    [String(discordId)]
  );
  return row;
}

// Get by username (case-insensitive)
async function getUserByUsername(username) {
  if (!username) return null;
  const rows = await all(
    `SELECT * FROM points WHERE LOWER(username) = LOWER(?)`,
    [String(username)]
  );
  return rows[0] || null;
}

// Add points (prioritise discordId).
// - delta > 0: affects BOTH points and lifetime_points
// - delta < 0: affects ONLY points (for PKD claims etc.)
async function addPoints(discordId, username, delta, reason = '') {
  const ts = Date.now();
  const positiveDelta = delta > 0 ? delta : 0;

  // Utility to fetch the final row after changes
  async function fetchResult(id) {
    if (!id) return null;
    const row = await getUserById(id);
    return row;
  }

  if (!discordId) {
    // fallback: try find user by username
    const existing = await getUserByUsername(username);
    if (existing) {
      const newPoints = (existing.points || 0) + delta;
      const newLifetime =
        (existing.lifetime_points || 0) + positiveDelta;

      await run(
        `UPDATE points
         SET points = ?, lifetime_points = ?, last_updated = ?
         WHERE discord_id = ?`,
        [newPoints, newLifetime, ts, existing.discord_id || '']
      );

      await run(
        `INSERT INTO point_logs (discord_id, username, points, reason, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
        [existing.discord_id || '', username, delta, reason, ts]
      );

      return fetchResult(existing.discord_id || '');
    } else {
      const newPoints = delta;
      const newLifetime = positiveDelta;
      const did = '';

      await run(
        `INSERT OR REPLACE INTO points
         (discord_id, username, points, lifetime_points, last_updated)
         VALUES (?, ?, ?, ?, ?)`,
        [did, username || 'Unknown', newPoints, newLifetime, ts]
      );

      await run(
        `INSERT INTO point_logs (discord_id, username, points, reason, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
        [did, username || 'Unknown', delta, reason, ts]
      );

      return fetchResult(did);
    }
  } else {
    const existing = await getUserById(discordId);
    if (existing) {
      const newPoints = (existing.points || 0) + delta;
      const newLifetime =
        (existing.lifetime_points || 0) + positiveDelta;

      await run(
        `UPDATE points
         SET points = ?, lifetime_points = ?, username = ?, last_updated = ?
         WHERE discord_id = ?`,
        [newPoints, newLifetime, username || existing.username, ts, discordId]
      );

      await run(
        `INSERT INTO point_logs (discord_id, username, points, reason, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
        [discordId, username || existing.username, delta, reason, ts]
      );

      return fetchResult(discordId);
    } else {
      const newPoints = delta;
      const newLifetime = positiveDelta;

      await run(
        `INSERT INTO points
         (discord_id, username, points, lifetime_points, last_updated)
         VALUES (?, ?, ?, ?, ?)`,
        [discordId, username || 'Unknown', newPoints, newLifetime, ts]
      );

      await run(
        `INSERT INTO point_logs (discord_id, username, points, reason, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
        [discordId, username || 'Unknown', delta, reason, ts]
      );

      return fetchResult(discordId);
    }
  }
}

// Get leaderboard (top N) by lifetime_points
async function getLeaderboard(limit = 10) {
  const rows = await all(
    `SELECT discord_id, username, points, lifetime_points, rank_name
     FROM points
     ORDER BY lifetime_points DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

async function getAllUsers() {
  const rows = await all(
    `SELECT discord_id, username, points, lifetime_points, rank_name, last_updated
     FROM points
     ORDER BY username COLLATE NOCASE`
  );
  return rows;
}

async function clearAllPoints() {
  await run(`DELETE FROM point_logs`);
  await run(`DELETE FROM points`);
}

module.exports = {
  db,
  init,
  getUserById,
  getUserByUsername,
  addPoints,
  getLeaderboard,
  getAllUsers,
  clearAllPoints
};
// database.js
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'bot.db');

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDataDir();

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('❌ Failed to open SQLite DB:', err);
  } else {
    console.log('✅ SQLite DB opened at', DB_PATH);
  }
});

// Promisify helper
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

// Initialize schema
async function init() {
  await run(`CREATE TABLE IF NOT EXISTS points (
    discord_id TEXT PRIMARY KEY,
    username TEXT,
    points INTEGER DEFAULT 0,
    last_updated INTEGER
  )`);
  // optional logs
  await run(`CREATE TABLE IF NOT EXISTS point_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT,
    username TEXT,
    points INTEGER,
    reason TEXT,
    timestamp INTEGER
  )`);
}

// Get by Discord ID
async function getUserById(discordId) {
  if (!discordId) return null;
  const row = await get(`SELECT * FROM points WHERE discord_id = ?`, [String(discordId)]);
  return row;
}

// Get by username (case-insensitive)
async function getUserByUsername(username) {
  if (!username) return null;
  // simple case-insensitive match
  const rows = await all(`SELECT * FROM points WHERE LOWER(username) = LOWER(?)`, [String(username)]);
  return rows[0] || null;
}

// Add points (prioritize discordId). Choice B: update username only when adding points.
async function addPoints(discordId, username, delta, reason = '') {
  const ts = Date.now();
  if (!discordId) {
    // fallback: try find user by username
    const existing = await getUserByUsername(username);
    if (existing) {
      const newPoints = (existing.points || 0) + delta;
      await run(`UPDATE points SET points = ?, last_updated = ? WHERE discord_id = ?`, [
        newPoints,
        ts,
        existing.discord_id || ''
      ]);
      await run(
        `INSERT INTO point_logs (discord_id, username, points, reason, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [existing.discord_id || '', username, delta, reason, ts]
      );
      return { discord_id: existing.discord_id, username: existing.username, points: newPoints };
    } else {
      // no discordId and no matching username — create a new row with discord_id empty string
      const newPoints = delta;
      const did = '';
      await run(
        `INSERT OR REPLACE INTO points (discord_id, username, points, last_updated) VALUES (?, ?, ?, ?)`,
        [did, username || 'Unknown', newPoints, ts]
      );
      await run(
        `INSERT INTO point_logs (discord_id, username, points, reason, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [did, username || 'Unknown', delta, reason, ts]
      );
      return { discord_id: did, username: username || 'Unknown', points: newPoints };
    }
  } else {
    // We have a discordId (preferred)
    const existing = await getUserById(discordId);
    if (existing) {
      const newPoints = (existing.points || 0) + delta;
      // Update points and *only* update username when adding points (Choice B)
      await run(
        `UPDATE points SET points = ?, username = ?, last_updated = ? WHERE discord_id = ?`,
        [newPoints, username || existing.username, ts, discordId]
      );
      await run(
        `INSERT INTO point_logs (discord_id, username, points, reason, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [discordId, username || existing.username, delta, reason, ts]
      );
      return { discord_id: discordId, username: username || existing.username, points: newPoints };
    } else {
      // create new row
      const newPoints = delta;
      await run(
        `INSERT INTO points (discord_id, username, points, last_updated) VALUES (?, ?, ?, ?)`,
        [discordId, username || 'Unknown', newPoints, ts]
      );
      await run(
        `INSERT INTO point_logs (discord_id, username, points, reason, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [discordId, username || 'Unknown', delta, reason, ts]
      );
      return { discord_id: discordId, username: username || 'Unknown', points: newPoints };
    }
  }
}

// Get leaderboard (top N)
async function getLeaderboard(limit = 10) {
  const rows = await all(`SELECT discord_id, username, points FROM points ORDER BY points DESC LIMIT ?`, [limit]);
  return rows;
}

async function getAllUsers() {
  const rows = await all(`SELECT discord_id, username, points, last_updated FROM points ORDER BY username COLLATE NOCASE`);
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

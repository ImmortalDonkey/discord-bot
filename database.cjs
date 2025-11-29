// database.cjs
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

// Database path
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'bot.db');

// Ensure /data exists
function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDataDir();

// Open DB
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

// Promisified helpers
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

// Ensure columns exist
async function ensureColumn(table, column, definition) {
  const info = await all(`PRAGMA table_info(${table})`);
  const exists = info.some(col => col.name === column);
  if (!exists) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`📦 Added column ${column} to ${table}`);
  }
}

// Initialise database
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

  await ensureColumn('points', 'lifetime_points', 'INTEGER DEFAULT 0');
  await ensureColumn('points', 'rank_name', 'TEXT');
}

// Fetch user by ID
async function getUserById(discordId) {
  if (!discordId) return null;
  return await get(
    `SELECT * FROM points WHERE discord_id = ?`,
    [String(discordId)]
  );
}

// Fetch user by username
async function getUserByUsername(username) {
  if (!username) return null;
  const rows = await all(
    `SELECT * FROM points WHERE LOWER(username) = LOWER(?)`,
    [String(username)]
  );
  return rows[0] || null;
}

// Add or subtract points
async function addPoints(discordId, username, delta, reason = '') {
  const ts = Date.now();
  const positiveDelta = delta > 0 ? delta : 0;

  let row = await getUserById(discordId);

  if (!row) {
    // Create user if missing
    await run(
      `INSERT INTO points (discord_id, username, points, lifetime_points, last_updated)
       VALUES (?, ?, ?, ?, ?)`,
      [discordId, username || 'Unknown', delta, positiveDelta, ts]
    );
  } else {
    // Update existing user
    const newPoints = (row.points || 0) + delta;
    const newLifetime = (row.lifetime_points || 0) + positiveDelta;

    await run(
      `UPDATE points SET points = ?, lifetime_points = ?, username = ?, last_updated = ?
       WHERE discord_id = ?`,
      [newPoints, newLifetime, username || row.username, ts, discordId]
    );
  }

  // Log change
  await run(
    `INSERT INTO point_logs (discord_id, username, points, reason, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [discordId, username, delta, reason, ts]
  );

  return getUserById(discordId);
}

// NEW FUNCTION — required by claim buttons
async function updateUserPoints(discordId, newPoints) {
  const ts = Date.now();

  await run(
    `UPDATE points
     SET points = ?, last_updated = ?
     WHERE discord_id = ?`,
    [newPoints, ts, discordId]
  );

  return getUserById(discordId);
}

// Leaderboard
async function getLeaderboard(limit = 10) {
  return await all(
    `SELECT discord_id, username, points, lifetime_points, rank_name
     FROM points
     ORDER BY lifetime_points DESC
     LIMIT ?`,
    [limit]
  );
}

async function getAllUsers() {
  return await all(
    `SELECT * FROM points ORDER BY username COLLATE NOCASE`
  );
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
  updateUserPoints,  // ← REQUIRED EXPORT
  getLeaderboard,
  getAllUsers,
  clearAllPoints
};

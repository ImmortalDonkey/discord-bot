// database.cjs
// ------------------------------------------------------
// POINTS + LOGS = SQLite (unchanged)
// BOUNTIES + CLAIMS = In-memory arrays (NEW)
// ------------------------------------------------------

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

// ------------------------------------------------------
// SQLITE – ONLY FOR POINTS
// ------------------------------------------------------
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
    if (err) console.error('❌ Failed to open SQLite DB:', err);
    else console.log('✅ SQLite DB opened at', DB_PATH);
  }
);

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

// ------------------------------------------------------
// INITIALISE SQLITE (POINTS ONLY)
// ------------------------------------------------------
async function init() {
  await run(`CREATE TABLE IF NOT EXISTS points (
    discord_id TEXT PRIMARY KEY,
    username TEXT,
    points INTEGER DEFAULT 0,
    last_updated INTEGER,
    lifetime_points INTEGER DEFAULT 0,
    rank_name TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS point_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT,
    username TEXT,
    points INTEGER,
    reason TEXT,
    timestamp INTEGER
  )`);

  // backwards-compat columns
  const info = await all(`PRAGMA table_info(points)`);
  const cols = info.map(c => c.name);
  if (!cols.includes("lifetime_points"))
    await run(`ALTER TABLE points ADD COLUMN lifetime_points INTEGER DEFAULT 0`);

  if (!cols.includes("rank_name"))
    await run(`ALTER TABLE points ADD COLUMN rank_name TEXT`);
}

// ------------------------------------------------------
// POINT FUNCTIONS (UNCHANGED)
// ------------------------------------------------------
async function getUserById(discordId) {
  return await get(`SELECT * FROM points WHERE discord_id = ?`, [discordId]);
}

async function getUserByUsername(username) {
  const rows = await all(
    `SELECT * FROM points WHERE LOWER(username) = LOWER(?)`,
    [String(username)]
  );
  return rows[0] || null;
}

async function addPoints(discordId, username, delta, reason = '') {
  const ts = Date.now();
  const positiveDelta = delta > 0 ? delta : 0;
  let row = await getUserById(discordId);

  if (!row) {
    await run(
      `INSERT INTO points (discord_id, username, points, lifetime_points, last_updated)
       VALUES (?, ?, ?, ?, ?)`,
      [discordId, username, delta, positiveDelta, ts]
    );
  } else {
    await run(
      `UPDATE points SET points=?, lifetime_points=?, username=?, last_updated=?
       WHERE discord_id=?`,
      [
        (row.points || 0) + delta,
        (row.lifetime_points || 0) + positiveDelta,
        username || row.username,
        ts,
        discordId
      ]
    );
  }

  await run(
    `INSERT INTO point_logs (discord_id, username, points, reason, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [discordId, username, delta, reason, ts]
  );

  return getUserById(discordId);
}

async function updateUserPoints(discordId, newPoints) {
  await run(
    `UPDATE points SET points=?, last_updated=? WHERE discord_id=?`,
    [newPoints, Date.now(), discordId]
  );
  return getUserById(discordId);
}

async function getLeaderboard(limit = 10) {
  return await all(
    `SELECT * FROM points ORDER BY lifetime_points DESC LIMIT ?`,
    [limit]
  );
}

async function getAllUsers() {
  return await all(`SELECT * FROM points ORDER BY username COLLATE NOCASE`);
}

async function clearAllPoints() {
  await run(`DELETE FROM point_logs`);
  await run(`DELETE FROM points`);
}

// ------------------------------------------------------
// MEMORY STORAGE FOR BOUNTIES + CLAIMS (NEW)
// ------------------------------------------------------
const memoryBounties = [];     // array of bounty objects
const memoryClaims = [];       // array of claim objects

// ---------------- BOUNTIES ----------------
async function createBounty(b) {
  memoryBounties.push({
    ...b,
    pokemons: b.pokemons || [],
    status: b.status || "pending",
    createdAt: b.createdAt || Date.now(),
  });
}

async function getBountyById(id) {
  return memoryBounties.find(b => String(b.id) === String(id)) || null;
}

async function updateBounty(id, patch) {
  const b = memoryBounties.find(b => String(b.id) === String(id));
  if (!b) return;

  Object.assign(b, patch);
}

async function getBountiesToStart(now) {
  return memoryBounties.filter(b =>
    b.status === "open" &&
    b.startTime <= now &&
    (!b.cardMessageId)
  );
}

async function getBountiesToExpire(now) {
  return memoryBounties.filter(b =>
    b.status === "open" &&
    b.endTime <= now &&
    b.cardMessageId
  );
}

// ---------------- CLAIMS ----------------
async function createBountyClaim(c) {
  const claim = {
    ...c,
    id: c.id || `${Date.now()}`,
    createdAt: c.createdAt || Date.now(),
    status: c.status || "pending"
  };

  memoryClaims.push(claim);
  return claim.id;
}

async function getBountyClaimById(id) {
  return memoryClaims.find(c => String(c.id) === String(id)) || null;
}

async function updateBountyClaim(id, patch) {
  const c = memoryClaims.find(c => String(c.id) === String(id));
  if (!c) return;
  Object.assign(c, patch);
}

async function getPendingClaimForBountyAndHunter(bountyId, hunterId) {
  return memoryClaims.find(c =>
    c.bountyId == bountyId &&
    c.hunterId == hunterId &&
    c.status === "pending"
  );
}

// ------------------------------------------------------
// EXPORT
// ------------------------------------------------------
module.exports = {
  db,
  init,

  // Points
  getUserById,
  getUserByUsername,
  addPoints,
  updateUserPoints,
  getLeaderboard,
  getAllUsers,
  clearAllPoints,

  // Bounties (memory-based)
  createBounty,
  getBountyById,
  updateBounty,
  getBountiesToStart,
  getBountiesToExpire,

  // Claims (memory-based)
  createBountyClaim,
  getBountyClaimById,
  updateBountyClaim,
  getPendingClaimForBountyAndHunter
};

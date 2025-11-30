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

// Promisified helpers (internal)
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
  // Points + logs (existing)
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

  // legacy safety (in case table already existed without cols)
  await ensureColumn('points', 'lifetime_points', 'INTEGER DEFAULT 0');
  await ensureColumn('points', 'rank_name', 'TEXT');

  // (Legacy / optional) scheduled bounties – leave for now in case something still uses it
  await run(`CREATE TABLE IF NOT EXISTS scheduled_bounties (
    id TEXT PRIMARY KEY,
    guild_id TEXT,
    requester_id TEXT,
    requester_name TEXT,
    pokemons TEXT,               -- JSON array of strings
    notes TEXT,
    start_time INTEGER,          -- ms since epoch
    end_time INTEGER,            -- ms since epoch
    duration_hours INTEGER,
    reward INTEGER,
    created_at INTEGER,
    announcement_channel_id TEXT,
    announcement_message_id TEXT
  )`);

  // NEW: canonical bounties table
  await run(`CREATE TABLE IF NOT EXISTS bounties (
    id TEXT PRIMARY KEY,
    guild_id TEXT,
    requester_id TEXT,
    requester_name TEXT,

    pokemons TEXT,               -- JSON array
    notes TEXT,

    start_time INTEGER,
    end_time INTEGER,
    duration_hours INTEGER,
    reward INTEGER,

    rarity_key TEXT,
    rarity_label TEXT,

    starts_immediately INTEGER DEFAULT 0, -- 0/1

    status TEXT,                -- 'pending','open','rejected','completed','expired'

    created_at INTEGER,
    approved_at INTEGER,

    request_thread_id TEXT,
    request_message_id TEXT,

    announcement_channel_id TEXT,
    announcement_message_id TEXT,

    card_channel_id TEXT,
    card_message_id TEXT,

    winner_id TEXT,
    winner_claim_id INTEGER
  )`);

  // NEW: bounty claims table
  await run(`CREATE TABLE IF NOT EXISTS bounty_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bounty_id TEXT,
    hunter_id TEXT,
    pokemon_id TEXT,
    proof TEXT,
    status TEXT,               -- 'pending','approved','denied'
    created_at INTEGER,
    resolved_at INTEGER,
    resolver_id TEXT,
    claim_thread_id TEXT,
    claim_message_id TEXT
  )`);
}

// ───────────────────────────────────
// Points helpers
// ───────────────────────────────────

async function getUserById(discordId) {
  if (!discordId) return null;
  return await get(
    `SELECT * FROM points WHERE discord_id = ?`,
    [String(discordId)]
  );
}

async function getUserByUsername(username) {
  if (!username) return null;
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

// ───────────────────────────────────
// Bounties (SQLite-based)
// ───────────────────────────────────

async function createBounty(b) {
  await run(
    `INSERT INTO bounties (
      id, guild_id, requester_id, requester_name,
      pokemons, notes,
      start_time, end_time, duration_hours, reward,
      rarity_key, rarity_label,
      starts_immediately,
      status,
      created_at, approved_at,
      request_thread_id, request_message_id,
      announcement_channel_id, announcement_message_id,
      card_channel_id, card_message_id,
      winner_id, winner_claim_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      b.id,
      b.guildId,
      b.requesterId,
      b.requesterName,
      JSON.stringify(b.pokemons || []),
      b.notes || '',
      b.startTime,
      b.endTime,
      b.durationHours,
      b.reward,
      b.rarityKey,
      b.rarityLabel,
      b.startsImmediately ? 1 : 0,
      b.status || 'pending',
      b.createdAt || Date.now(),
      b.approvedAt || null,
      b.requestThreadId || null,
      b.requestMessageId || null,
      b.announcementChannelId || null,
      b.announcementMessageId || null,
      b.cardChannelId || null,
      b.cardMessageId || null,
      b.winnerId || null,
      b.winnerClaimId || null
    ]
  );
}

async function getBountyById(id) {
  const row = await get(`SELECT * FROM bounties WHERE id = ?`, [id]);
  return row || null;
}

async function updateBounty(id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const setSql = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => patch[k]);
  values.push(id);
  await run(`UPDATE bounties SET ${setSql} WHERE id = ?`, values);
}

async function getBountiesToStart(nowMs) {
  return await all(
    `SELECT * FROM bounties
     WHERE status = 'open'
       AND start_time <= ?
       AND (card_message_id IS NULL OR card_message_id = '')`,
    [nowMs]
  );
}

async function getBountiesToExpire(nowMs) {
  return await all(
    `SELECT * FROM bounties
     WHERE status = 'open'
       AND end_time <= ?
       AND card_message_id IS NOT NULL
       AND card_message_id <> ''`,
    [nowMs]
  );
}

// ───────────────────────────────────
// Bounty claims
// ───────────────────────────────────

async function createBountyClaim(c) {
  const res = await run(
    `INSERT INTO bounty_claims (
      bounty_id, hunter_id, pokemon_id, proof,
      status, created_at, resolved_at, resolver_id,
      claim_thread_id, claim_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.bountyId,
      c.hunterId,
      c.pokemonId,
      c.proof || '',
      c.status || 'pending',
      c.createdAt || Date.now(),
      c.resolvedAt || null,
      c.resolverId || null,
      c.claimThreadId || null,
      c.claimMessageId || null
    ]
  );
  return res.lastID; // claim id
}

async function getBountyClaimById(id) {
  return await get(`SELECT * FROM bounty_claims WHERE id = ?`, [id]);
}

async function updateBountyClaim(id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const setSql = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => patch[k]);
  values.push(id);
  await run(`UPDATE bounty_claims SET ${setSql} WHERE id = ?`, values);
}

/**
 * Helper: check if a hunter already has a pending claim on a bounty.
 */
async function getPendingClaimForBountyAndHunter(bountyId, hunterId) {
  return await get(
    `SELECT * FROM bounty_claims
     WHERE bounty_id = ?
       AND hunter_id = ?
       AND status = 'pending'`,
    [bountyId, hunterId]
  );
}

// ───────────────────────────────────

module.exports = {
  db,
  init,

  // points
  getUserById,
  getUserByUsername,
  addPoints,
  updateUserPoints,
  getLeaderboard,
  getAllUsers,
  clearAllPoints,

  // legacy scheduled bounties (leave as-is)
  saveScheduledBounty: async (...args) => {
    console.warn('⚠ saveScheduledBounty is legacy and not used by the new bounty system.');
  },
  deleteScheduledBounty: async (...args) => {
    console.warn('⚠ deleteScheduledBounty is legacy and not used by the new bounty system.');
  },
  getAllScheduledBounties: async () => [],

  // new bounty helpers
  createBounty,
  getBountyById,
  updateBounty,
  getBountiesToStart,
  getBountiesToExpire,

  // bounty claims
  createBountyClaim,
  getBountyClaimById,
  updateBountyClaim,
  getPendingClaimForBountyAndHunter
};
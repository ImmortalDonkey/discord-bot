// database.cjs
// ------------------------------------------------------
// POINTS + LOGS = SQLite
// BOUNTIES + CLAIMS = SQLite + in-memory cache
// REPORTS = SQLite
// PLAYERS (IGN) = SQLite (global, multi-server safe)
// ------------------------------------------------------

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

// ------------------------------------------------------
// SQLITE BASE SETUP
// ------------------------------------------------------

const DB_PATH =
  process.env.DB_PATH ||
  process.env.DB_FILE ||
  path.join(__dirname, 'data', 'bot.db');

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
// BOT META HELPERS
// ------------------------------------------------------

async function getMeta(key) {
  const row = await get(`SELECT value FROM bot_meta WHERE key = ?`, [key]);
  return row ? row.value : null;
}

async function setMeta(key, value) {
  await run(
    `INSERT OR REPLACE INTO bot_meta (key, value)
     VALUES (?, ?)`,
    [key, String(value)]
  );
}

// ------------------------------------------------------
// INITIALISE SQLITE SCHEMA
// ------------------------------------------------------

async function init() {

  // ---------------- POINTS ----------------
  await run(`CREATE TABLE IF NOT EXISTS points (
    discord_id TEXT PRIMARY KEY,
    username TEXT,
    points INTEGER DEFAULT 0,
    last_updated INTEGER,
    lifetime_points INTEGER DEFAULT 0,
    rank_name TEXT,
    completed_bounties INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS point_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT,
    username TEXT,
    points INTEGER,
    reason TEXT,
    timestamp INTEGER
  )`);

  const pointCols = (await all(`PRAGMA table_info(points)`)).map(c => c.name);
  if (!pointCols.includes('lifetime_points')) {
    await run(`ALTER TABLE points ADD COLUMN lifetime_points INTEGER DEFAULT 0`);
  }
  if (!pointCols.includes('rank_name')) {
    await run(`ALTER TABLE points ADD COLUMN rank_name TEXT`);
  }
  if (!pointCols.includes('completed_bounties')) {
    await run(`ALTER TABLE points ADD COLUMN completed_bounties INTEGER DEFAULT 0`);
  }

  // ---------------- PLAYERS (IGN IDENTITY) ----------------
  await run(`CREATE TABLE IF NOT EXISTS players (
    discord_id TEXT PRIMARY KEY,
    ign TEXT NOT NULL COLLATE NOCASE,
    discord_username TEXT,
    created_at INTEGER,
    updated_at INTEGER
  )`);

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_players_ign
             ON players (ign COLLATE NOCASE)`);

  // ---------------- PLAYER ↔ GUILD ----------------
  await run(`CREATE TABLE IF NOT EXISTS player_guilds (
    discord_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    nickname TEXT,
    joined_at INTEGER,
    last_seen INTEGER,
    PRIMARY KEY (discord_id, guild_id)
  )`);

  await run(`CREATE INDEX IF NOT EXISTS idx_player_guilds_guild
             ON player_guilds (guild_id)`);

  // ---------------- BOUNTIES ----------------
  await run(`CREATE TABLE IF NOT EXISTS bounties (
    id TEXT PRIMARY KEY,
    guild_id TEXT,
    requester_id TEXT,
    requester_name TEXT,
    pokemons TEXT,
    notes TEXT,
    start_time INTEGER,
    end_time INTEGER,
    duration_hours INTEGER,
    reward INTEGER,
    rarity_key TEXT,
    rarity_label TEXT,
    starts_immediately INTEGER DEFAULT 0,
    status TEXT,
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

  const bountyCols = (await all(`PRAGMA table_info(bounties)`)).map(c => c.name);
  if (!bountyCols.includes('winner_claim_id')) {
    await run(`ALTER TABLE bounties ADD COLUMN winner_claim_id INTEGER`);
  }

  // ---------------- CLAIMS ----------------
  await run(`CREATE TABLE IF NOT EXISTS bounty_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bounty_id TEXT,
    hunter_id TEXT,
    pokemon_id TEXT,
    proof TEXT,
    status TEXT,
    created_at INTEGER,
    resolved_at INTEGER,
    resolver_id TEXT,
    claim_thread_id TEXT,
    claim_message_id TEXT
  )`);

  // ---------------- REPORTS ----------------
  await run(`CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    guild_id TEXT,
    reporter_id TEXT,
    reporter_name TEXT,
    trainer_rank TEXT,
    pokemon_name TEXT,
    rarity_key TEXT,
    rarity_label TEXT,
    location TEXT,
    status TEXT,
    message_id TEXT,
    channel_id TEXT,
    points INTEGER,
    expires_at INTEGER,
    delete_at INTEGER,
    created_at INTEGER,
    image_path TEXT
  )`);

  await run(`DELETE FROM reports WHERE reporter_id IS NULL OR reporter_id = ''`);

  await loadBountiesFromDB();
  await loadClaimsFromDB();

  console.log(`✅ Database initialised`);
}

// ------------------------------------------------------
// PLAYER / IGN API (NEW)
// ------------------------------------------------------

async function upsertPlayer({ discordId, ign, discordUsername }) {
  const ts = Date.now();
  await run(
    `
    INSERT INTO players (discord_id, ign, discord_username, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      ign = excluded.ign,
      discord_username = excluded.discord_username,
      updated_at = excluded.updated_at
    `,
    [discordId, ign.trim(), discordUsername || null, ts, ts]
  );
  return getPlayerByDiscordId(discordId);
}

async function getPlayerByDiscordId(discordId) {
  return await get(`SELECT * FROM players WHERE discord_id = ?`, [discordId]);
}

async function getPlayerByIgn(ign) {
  return await get(
    `SELECT * FROM players WHERE ign = ? COLLATE NOCASE`,
    [ign.trim()]
  );
}

async function getDiscordIdByIgn(ign) {
  const row = await getPlayerByIgn(ign);
  return row?.discord_id || null;
}

async function deletePlayer(discordId) {
  await run(`DELETE FROM player_guilds WHERE discord_id = ?`, [discordId]);
  await run(`DELETE FROM players WHERE discord_id = ?`, [discordId]);
}

async function upsertPlayerGuild({ discordId, guildId, nickname }) {
  const ts = Date.now();
  await run(
    `
    INSERT INTO player_guilds (discord_id, guild_id, nickname, joined_at, last_seen)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discord_id, guild_id) DO UPDATE SET
      nickname = excluded.nickname,
      last_seen = excluded.last_seen
    `,
    [discordId, guildId, nickname || null, ts, ts]
  );
}

async function getPlayerGuild(discordId, guildId) {
  return await get(
    `SELECT * FROM player_guilds WHERE discord_id = ? AND guild_id = ?`,
    [discordId, guildId]
  );
}

// ------------------------------------------------------
// EXPORT
// ------------------------------------------------------

module.exports = {
  db,
  init,

  // raw helpers
  run,
  get,
  all,

  // Bot meta
  getMeta,
  setMeta,

  // Players / IGN
  upsertPlayer,
  getPlayerByDiscordId,
  getPlayerByIgn,
  getDiscordIdByIgn,
  deletePlayer,
  upsertPlayerGuild,
  getPlayerGuild,

  // Points
  addPoints,
  getLeaderboard,
  clearAllPoints,

  // Reports
  createReport: async (r) => r,
  findActiveReportThisHour: async () => null
};
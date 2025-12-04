// database.cjs
// ------------------------------------------------------
// POINTS + LOGS = SQLite
// BOUNTIES + CLAIMS = SQLite + in-memory cache
// REPORTS = SQLite
// ------------------------------------------------------

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

// ------------------------------------------------------
// SQLITE BASE SETUP
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
// INITIALISE SQLITE SCHEMA
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

  const infoPoints = await all(`PRAGMA table_info(points)`);
  const pointCols = infoPoints.map(c => c.name);

  if (!pointCols.includes('lifetime_points')) {
    await run(`ALTER TABLE points ADD COLUMN lifetime_points INTEGER DEFAULT 0`);
  }
  if (!pointCols.includes('rank_name')) {
    await run(`ALTER TABLE points ADD COLUMN rank_name TEXT`);
  }

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

  const infoBounties = await all(`PRAGMA table_info(bounties)`);
  const bountyCols = infoBounties.map(c => c.name);
  if (!bountyCols.includes('winner_claim_id')) {
    await run(`ALTER TABLE bounties ADD COLUMN winner_claim_id INTEGER`);
  }

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

  await run(`CREATE TABLE IF NOT EXISTS scheduled_bounties (
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
    created_at INTEGER,
    announcement_channel_id TEXT,
    announcement_message_id TEXT
  )`);

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

  async function ensureReportColumns() {
    const infoReports = await all(`PRAGMA table_info(reports)`);
    const reportCols = infoReports.map(c => c.name);

    const expected = {
      trainer_rank: 'TEXT',
      points: 'INTEGER DEFAULT 0',
      delete_at: 'INTEGER'
    };

    for (const [col, type] of Object.entries(expected)) {
      if (!reportCols.includes(col)) {
        console.warn(`⚠️ Adding missing column to reports: ${col}`);
        await run(`ALTER TABLE reports ADD COLUMN ${col} ${type}`);
      }
    }
  }
  await ensureReportColumns();

  await run(`DELETE FROM reports WHERE reporter_id IS NULL OR reporter_id = ''`);

  await loadBountiesFromDB();
  await loadClaimsFromDB();

  console.log(
    `✅ Database initialised – ${memoryBounties.length} bounties, ${memoryClaims.length} claims loaded from SQLite`
  );
}

// ------------------------------------------------------
// HELPERS FOR NORMALISING
// ------------------------------------------------------
const memoryBounties = [];
const memoryClaims = [];

function safeJsonArray(str) {
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeReportObject(source) {
  if (!source) return null;

  return {
    id: String(source.id),

    guildId: source.guildId ?? source.guild_id ?? null,
    reporterId: source.reporterId ?? source.reporter_id ?? null,
    reporterName: source.reporterName ?? source.reporter_name ?? null,
    trainerRank: source.trainerRank ?? source.trainer_rank ?? null,

    pokemonName: source.pokemonName ?? source.pokemon_name ?? null,
    rarityKey: source.rarityKey ?? source.rarity_key ?? null,
    rarityLabel: source.rarityLabel ?? source.rarity_label ?? null,
    location: source.location ?? source.route ?? null,

    status: source.status ?? 'active',

    messageId: source.messageId ?? source.message_id ?? null,
    channelId: source.channelId ?? source.channel_id ?? null,

    points: source.points ?? 0,
    expiresAt: source.expiresAt ?? source.expires_at ?? null,
    deleteAt: source.deleteAt ?? source.delete_at ?? null,
    createdAt: source.createdAt ?? source.created_at ?? Date.now(),

    imagePath: source.imagePath ?? source.image_path ?? null,
  };
}

// ------------------------------------------------------
// LOAD BOUNTIES + CLAIMS (unchanged)
// ------------------------------------------------------
async function loadBountiesFromDB() {
  const rows = await all(`SELECT * FROM bounties`);
  memoryBounties.length = 0;

  for (const row of rows) {
    const b = normalizeBountyObject(row);
    if (b && b.id) memoryBounties.push(b);
  }
}

async function loadClaimsFromDB() {
  const rows = await all(`SELECT * FROM bounty_claims`);
  memoryClaims.length = 0;

  for (const row of rows) {
    const c = normalizeClaimObject(row);
    if (c) memoryClaims.push(c);
  }
}

// ------------------------------------------------------
// PUBLIC REPORT API (UPDATED)
// ------------------------------------------------------
async function createReport(reportObj) {
  const base = { status: reportObj.status || 'active', createdAt: reportObj.createdAt || Date.now(), ...reportObj };
  const norm = normalizeReportObject(base);
  return await persistReportToDb(norm);
}

async function getReport(id) {
  const row = await get(`SELECT * FROM reports WHERE id = ?`, [id]);
  if (!row) return null;
  return normalizeReportObject(row);
}

async function updateReport(id, patch) {
  const existing = await getReport(id);
  if (!existing) return null;

  const merged = normalizeReportObject({ ...existing, ...patch, id });
  return await persistReportToDb(merged);
}

async function deleteReport(id) {
  await run(`DELETE FROM reports WHERE id = ?`, [id]);
}

async function getReportsToExpire(nowMs) {
  const rows = await all(
    `SELECT * FROM reports WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= ?`,
    [nowMs]
  );
  return rows.map(normalizeReportObject);
}

async function getReportsToCleanup(nowMs) {
  const rows = await all(
    `SELECT * FROM reports WHERE status='expired' AND delete_at IS NOT NULL AND delete_at <= ?`,
    [nowMs]
  );
  return rows.map(normalizeReportObject);
}

/**
 * NEW — Check if same Pokémon active in same hour
 */
async function findActiveReportThisHour(pokemonKey, nowMs) {
  const date = new Date(nowMs);
  date.setMinutes(0, 0, 0);
  const blockStart = date.getTime();

  const sql = `
    SELECT * FROM reports
    WHERE status = 'active'
      AND LOWER(pokemon_name) = LOWER(?)
      AND created_at >= ?
    LIMIT 1
  `;
  const row = await get(sql, [pokemonKey, blockStart]);
  return row ? normalizeReportObject(row) : null;
}

// ------------------------------------------------------
// EXPORT
// ------------------------------------------------------
module.exports = {
  db,
  init,
  run,
  get,
  all,

  // Reports
  createReport,
  getReport,
  updateReport,
  deleteReport,
  getReportsToExpire,
  getReportsToCleanup,
  findActiveReportThisHour,
};
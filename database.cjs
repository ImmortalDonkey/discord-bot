// database.cjs
// ------------------------------------------------------
// FULL DB LAYER: POINTS / BOUNTIES / CLAIMS / REPORTS
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
  // POINT TABLES
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

  // BOUNTIES TABLE
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

  // BOUNTY CLAIMS
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

  // REPORTS TABLE
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
    const cols = infoReports.map(c => c.name);
    const expected = {
      trainer_rank: 'TEXT',
      points: 'INTEGER DEFAULT 0',
      delete_at: 'INTEGER'
    };
    for (const [col, type] of Object.entries(expected)) {
      if (!cols.includes(col)) {
        console.warn(`⚠️ Adding missing column ${col}`);
        await run(`ALTER TABLE reports ADD COLUMN ${col} ${type}`);
      }
    }
  }
  await ensureReportColumns();

  await run(`DELETE FROM reports WHERE reporter_id IS NULL OR reporter_id = ''`);

  await loadBountiesFromDB();
  await loadClaimsFromDB();

  console.log(`🗄 DB Ready — ${memoryBounties.length} bounties, ${memoryClaims.length} claims`);
}

// ------------------------------------------------------
// POINTS API
// ------------------------------------------------------
async function getUserById(discordId) {
  return get(`SELECT * FROM points WHERE discord_id=?`, [discordId]);
}

async function addPoints(discordId, username, delta, reason = '') {
  const ts = Date.now();
  const pos = delta > 0 ? delta : 0;
  let row = await getUserById(discordId);

  if (!row) {
    await run(
      `INSERT INTO points (discord_id,username,points,lifetime_points,last_updated)
       VALUES(?,?,?,?,?)`,
      [discordId, username, delta, pos, ts]
    );
  } else {
    await run(
      `UPDATE points SET points=?, lifetime_points=?, username=?, last_updated=?
       WHERE discord_id=?`,
      [
        (row.points || 0) + delta,
        (row.lifetime_points || 0) + pos,
        username || row.username,
        ts,
        discordId
      ]
    );
  }

  await run(
    `INSERT INTO point_logs (discord_id,username,points,reason,timestamp)
     VALUES(?,?,?,?,?)`,
    [discordId, username, delta, reason, ts]
  );

  return getUserById(discordId);
}

async function getLeaderboard(limit=10) {
  return all(`SELECT * FROM points ORDER BY lifetime_points DESC LIMIT ?`, [limit]);
}

async function clearAllPoints() {
  await run(`DELETE FROM point_logs`);
  await run(`DELETE FROM points`);
}

// ------------------------------------------------------
// NORMALISERS
// ------------------------------------------------------
function safeJsonArray(str) {
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeBountyObject(src) {
  if (!src) return null;
  const pokemons = Array.isArray(src.pokemons)
    ? src.pokemons
    : safeJsonArray(src.pokemons);
  return {
    id: String(src.id),
    guildId: src.guild_id ?? src.guildId ?? null,
    requesterId: src.requester_id ?? src.requesterId ?? null,
    requesterName: src.requester_name ?? src.requesterName ?? null,
    pokemons,
    notes: src.notes ?? null,
    startTime: src.start_time ?? src.startTime ?? null,
    endTime: src.end_time ?? src.endTime ?? null,
    durationHours: src.duration_hours ?? src.durationHours ?? 0,
    reward: src.reward ?? null,
    rarityKey: src.rarity_key ?? src.rarityKey ?? null,
    rarityLabel: src.rarity_label ?? src.rarityLabel ?? null,
    startsImmediately: !!(src.starts_immediately ?? src.startsImmediately),
    status: src.status ?? 'pending',
    createdAt: src.created_at ?? src.createdAt ?? Date.now(),
    approvedAt: src.approved_at ?? src.approvedAt ?? null,
    requestThreadId: src.request_thread_id ?? src.requestThreadId ?? null,
    requestMessageId: src.request_message_id ?? src.requestMessageId ?? null,
    announcementChannelId: src.announcement_channel_id ?? src.announcementChannelId ?? null,
    announcementMessageId: src.announcement_message_id ?? src.announcementMessageId ?? null,
    cardChannelId: src.card_channel_id ?? src.cardChannelId ?? null,
    cardMessageId: src.card_message_id ?? src.cardMessageId ?? null,
    winnerId: src.winner_id ?? src.winnerId ?? null,
    winnerClaimId: src.winner_claim_id ?? src.winnerClaimId ?? null,
  };
}

function normalizeClaimObject(src) {
  if (!src) return null;
  return {
    id: src.id ?? null,
    bountyId: src.bounty_id ?? src.bountyId ?? null,
    hunterId: src.hunter_id ?? src.hunterId ?? null,
    pokemonId: src.pokemon_id ?? src.pokemonId ?? null,
    proof: src.proof ?? null,
    status: src.status ?? 'pending',
    createdAt: src.created_at ?? src.createdAt ?? Date.now(),
    resolvedAt: src.resolved_at ?? src.resolvedAt ?? null,
    resolverId: src.resolver_id ?? src.resolverId ?? null,
    claimThreadId: src.claim_thread_id ?? src.claimThreadId ?? null,
    claimMessageId: src.claim_message_id ?? src.claimMessageId ?? null,
  };
}

function normalizeReportObject(src) {
  if (!src) return null;
  return {
    id: String(src.id),
    guildId: src.guild_id ?? src.guildId ?? null,
    reporterId: src.reporter_id ?? src.reporterId ?? null,
    reporterName: src.reporter_name ?? src.reporterName ?? null,
    trainerRank: src.trainer_rank ?? src.trainerRank ?? null,
    pokemonName: src.pokemon_name ?? src.pokemonName ?? null,
    rarityKey: src.rarity_key ?? src.rarityKey ?? null,
    rarityLabel: src.rarity_label ?? src.rarityLabel ?? null,
    location: src.location ?? src.route ?? null,
    status: src.status ?? 'active',
    messageId: src.message_id ?? src.messageId ?? null,
    channelId: src.channel_id ?? src.channelId ?? null,
    points: src.points ?? 0,
    expiresAt: src.expires_at ?? src.expiresAt ?? null,
    deleteAt: src.delete_at ?? src.deleteAt ?? null,
    createdAt: src.created_at ?? src.createdAt ?? Date.now(),
    imagePath: src.image_path ?? src.imagePath ?? null
  };
}

// ------------------------------------------------------
// MEMORY CACHES
// ------------------------------------------------------
const memoryBounties = [];
const memoryClaims = [];

// ------------------------------------------------------
// DB LOAD ON STARTUP
// ------------------------------------------------------
async function loadBountiesFromDB() {
  const rows = await all(`SELECT * FROM bounties`);
  memoryBounties.length = 0;
  rows.forEach(r => {
    const b = normalizeBountyObject(r);
    if (b) memoryBounties.push(b);
  });
}

async function loadClaimsFromDB() {
  const rows = await all(`SELECT * FROM bounty_claims`);
  memoryClaims.length = 0;
  rows.forEach(r => {
    const c = normalizeClaimObject(r);
    if (c) memoryClaims.push(c);
  });
}

// ------------------------------------------------------
// REPORT PERSIST HELPERS
// ------------------------------------------------------
async function persistReportToDb(report) {
  const r = normalizeReportObject(report);
  await run(
    `INSERT OR REPLACE INTO reports (
      id,guild_id,reporter_id,reporter_name,trainer_rank,pokemon_name,
      rarity_key,rarity_label,location,status,message_id,channel_id,
      points,expires_at,delete_at,created_at,image_path
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      r.id,r.guildId,r.reporterId,r.reporterName,r.trainerRank,r.pokemonName,
      r.rarityKey,r.rarityLabel,r.location,r.status,r.messageId,r.channelId,
      r.points,r.expiresAt,r.deleteAt,r.createdAt,r.imagePath
    ]
  );
  return r;
}

// ------------------------------------------------------
// PUBLIC REPORT API
// ------------------------------------------------------
async function createReport(reportObj) {
  const norm = normalizeReportObject({
    status: reportObj.status || 'active',
    ...reportObj
  });
  return persistReportToDb(norm);
}

async function getReport(id) {
  const row = await get(`SELECT * FROM reports WHERE id=?`, [id]);
  return normalizeReportObject(row);
}

async function updateReport(id, patch) {
  const existing = await getReport(id);
  if (!existing) return null;
  const merged = normalizeReportObject({ ...existing, ...patch, id });
  return persistReportToDb(merged);
}

async function deleteReport(id) {
  await run(`DELETE FROM reports WHERE id=?`, [id]);
}

async function getReportsToExpire(nowMs) {
  const rows = await all(
    `SELECT * FROM reports
     WHERE status='active'
       AND expires_at <= ?
       AND expires_at IS NOT NULL`,
    [nowMs]
  );
  return rows.map(normalizeReportObject);
}

async function getReportsToCleanup(nowMs) {
  const rows = await all(
    `SELECT * FROM reports
     WHERE status='expired'
       AND delete_at <= ?
       AND delete_at IS NOT NULL`,
    [nowMs]
  );
  return rows.map(normalizeReportObject);
}

/**
 * Duplicates: same Pokémon cannot be reported in the same hour
 */
async function findActiveReportThisHour(pokemonName, nowMs) {
  const date = new Date(nowMs);
  date.setMinutes(0, 0, 0);
  const hourStart = date.getTime();

  const row = await get(
    `SELECT * FROM reports
     WHERE status='active'
       AND LOWER(pokemon_name)=LOWER(?)
       AND created_at >= ?
     LIMIT 1`,
    [pokemonName.toLowerCase(), hourStart]
  );

  return row ? normalizeReportObject(row) : null;
}

// ------------------------------------------------------
// BOUNTY PUBLIC
// ------------------------------------------------------
async function createBounty(obj) {
  const base = normalizeBountyObject({ ...obj, status:'pending', createdAt:Date.now() });
  return persistBountyToDb(base);
}

async function getBountyById(id) {
  const mem = memoryBounties.find(x => x.id === String(id));
  if (mem) return mem;
  const row = await get(`SELECT * FROM bounties WHERE id=?`, [id]);
  if (!row) return null;
  const norm = normalizeBountyObject(row);
  memoryBounties.push(norm);
  return norm;
}

async function updateBounty(id, patch) {
  const existing = await getBountyById(id);
  if (!existing) return null;
  const merged = normalizeBountyObject({ ...existing, ...patch });
  return persistBountyToDb(merged);
}

async function getBountiesToStart(nowMs) {
  return memoryBounties.filter(b =>
    b.status === 'open' &&
    typeof b.startTime === 'number' &&
    b.startTime <= nowMs &&
    !b.cardMessageId
  );
}

async function getBountiesToExpire(nowMs) {
  return memoryBounties.filter(b =>
    b.status === 'open' &&
    typeof b.endTime === 'number' &&
    b.endTime <= nowMs &&
    !!b.cardMessageId
  );
}

// ------------------------------------------------------
// CLAIM PUBLIC
// ------------------------------------------------------
async function createBountyClaim(obj) {
  let c = normalizeClaimObject({ ...obj, status:'pending', createdAt:Date.now() });
  const res = await run(
    `INSERT INTO bounty_claims (
      bounty_id,hunter_id,pokemon_id,proof,status,
      created_at,resolved_at,resolver_id,claim_thread_id,claim_message_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      c.bountyId,c.hunterId,c.pokemonId,c.proof,c.status,
      c.createdAt,c.resolvedAt,c.resolverId,c.claimThreadId,c.claimMessageId
    ]
  );
  c.id = res.lastID;
  memoryClaims.push(c);
  return c.id;
}

async function getBountyClaimById(id) {
  const mem = memoryClaims.find(x => x.id === Number(id));
  if (mem) return mem;
  const row = await get(`SELECT * FROM bounty_claims WHERE id=?`, [id]);
  if (!row) return null;
  const norm = normalizeClaimObject(row);
  memoryClaims.push(norm);
  return norm;
}

async function updateBountyClaim(id, patch) {
  const existing = await getBountyClaimById(id);
  if (!existing) return null;
  const merged = normalizeClaimObject({ ...existing, ...patch });
  await run(
    `UPDATE bounty_claims SET
      bounty_id=?, hunter_id=?, pokemon_id=?, proof=?,
      status=?, created_at=?, resolved_at=?, resolver_id=?,
      claim_thread_id=?, claim_message_id=?
     WHERE id=?`,
    [
      merged.bountyId, merged.hunterId, merged.pokemonId, merged.proof,
      merged.status, merged.createdAt, merged.resolvedAt, merged.resolverId,
      merged.claimThreadId, merged.claimMessageId, merged.id
    ]
  );
}

async function getPendingClaimForBountyAndHunter(bountyId, hunterId) {
  return memoryClaims.find(c =>
    String(c.bountyId) === String(bountyId) &&
    String(c.hunterId) === String(hunterId) &&
    c.status === 'pending'
  ) || null;
}

// ------------------------------------------------------
// EXPORT EVERYTHING
// ------------------------------------------------------
module.exports = {
  db,
  init,
  run,
  get,
  all,

  // Points
  getUserById,
  addPoints,
  getLeaderboard,
  clearAllPoints,

  // Bounties
  createBounty,
  getBountyById,
  updateBounty,
  getBountiesToStart,
  getBountiesToExpire,

  // Claims
  createBountyClaim,
  getBountyClaimById,
  updateBountyClaim,
  getPendingClaimForBountyAndHunter,

  // Reports
  createReport,
  getReport,
  updateReport,
  deleteReport,
  getReportsToExpire,
  getReportsToCleanup,
  findActiveReportThisHour
};
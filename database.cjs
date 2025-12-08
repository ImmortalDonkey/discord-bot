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
      resolve(this); // this.lastID, this.changes
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
  // -------- POINTS TABLES --------
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

  const infoPoints = await all(`PRAGMA table_info(points)`);
  const pointCols = infoPoints.map(c => c.name);

  if (!pointCols.includes('lifetime_points')) {
    await run(`ALTER TABLE points ADD COLUMN lifetime_points INTEGER DEFAULT 0`);
  }
  if (!pointCols.includes('rank_name')) {
    await run(`ALTER TABLE points ADD COLUMN rank_name TEXT`);
  }
  if (!pointCols.includes('completed_bounties')) {
    await run(`ALTER TABLE points ADD COLUMN completed_bounties INTEGER DEFAULT 0`);
  }

  // -------- BOUNTIES TABLE --------
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

  // -------- BOUNTY_CLAIMS TABLE --------
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

  // -------- SCHEDULED_BOUNTIES --------
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

  // -------- REPORTS TABLE --------
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
// POINT FUNCTIONS
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

// ⭐ NEW: completed bounty helpers ⭐
async function incrementCompletedBounties(discordId, amount = 1) {
  await run(
    `UPDATE points
     SET completed_bounties = COALESCE(completed_bounties, 0) + ?
     WHERE discord_id = ?`,
    [amount, discordId]
  );
}

async function getTotalCompletedBounties() {
  const row = await get(
    `SELECT SUM(completed_bounties) AS total FROM points`
  );
  return row && row.total ? row.total : 0;
}
// ⭐ NEW: lifetime_points direct setter ⭐
async function updateLifetimePoints(discordId, newLifetime) {
  await run(
    `UPDATE points
     SET lifetime_points = ?, last_updated = ?
     WHERE discord_id = ?`,
    [newLifetime, Date.now(), discordId]
  );
  return getUserById(discordId);
}

// ------------------------------------------------------
// IN-MEMORY CACHE FOR BOUNTIES + CLAIMS
// ------------------------------------------------------
const memoryBounties = [];
const memoryClaims = [];

// ---------------- HELPERS ----------------
function safeJsonArray(str) {
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeBountyObject(source) {
  if (!source) return null;

  const pokemonsField = source.pokemons;

  return {
    id: String(source.id),

    guildId: source.guildId ?? source.guild_id ?? null,
    requesterId: source.requesterId ?? source.requester_id ?? null,
    requesterName: source.requesterName ?? source.requester_name ?? null,

    pokemons: Array.isArray(pokemonsField)
      ? pokemonsField
      : (typeof pokemonsField === 'string'
        ? safeJsonArray(pokemonsField)
        : []),

    notes: source.notes ?? null,

    startTime: source.startTime ?? source.start_time ?? null,
    endTime: source.endTime ?? source.end_time ?? null,
    durationHours: source.durationHours ?? source.duration_hours ?? 0,
    reward: source.reward ?? null,

    rarityKey: source.rarityKey ?? source.rarity_key ?? null,
    rarityLabel: source.rarityLabel ?? source.rarity_label ?? null,

    startsImmediately: typeof source.startsImmediately === 'boolean'
      ? source.startsImmediately
      : !!(source.starts_immediately),

    status: source.status ?? 'pending',

    createdAt: source.createdAt ?? source.created_at ?? Date.now(),
    approvedAt: source.approvedAt ?? source.approved_at ?? null,

    requestThreadId: source.requestThreadId ?? source.request_thread_id ?? null,
    requestMessageId: source.requestMessageId ?? source.request_message_id ?? null,
    announcementChannelId:
      source.announcementChannelId ?? source.announcement_channel_id ?? null,
    announcementMessageId:
      source.announcementMessageId ?? source.announcement_message_id ?? null,
    cardChannelId: source.cardChannelId ?? source.card_channel_id ?? null,
    cardMessageId: source.cardMessageId ?? source.card_message_id ?? null,

    winnerId: source.winnerId ?? source.winner_id ?? null,
    winnerClaimId: source.winnerClaimId ?? source.winner_claim_id ?? null
  };
}

function normalizeClaimObject(source) {
  if (!source) return null;
  return {
    id: source.id ?? null,
    bountyId: source.bountyId ?? source.bounty_id ?? null,
    hunterId: source.hunterId ?? source.hunter_id ?? null,
    pokemonId: source.pokemonId ?? source.pokemon_id ?? null,
    proof: source.proof ?? null,
    status: source.status ?? 'pending',
    createdAt: source.createdAt ?? source.created_at ?? Date.now(),
    resolvedAt: source.resolvedAt ?? source.resolved_at ?? null,
    resolverId: source.resolverId ?? source.resolver_id ?? null,
    claimThreadId: source.claimThreadId ?? source.claim_thread_id ?? null,
    claimMessageId: source.claimMessageId ?? source.claim_message_id ?? null
  };
}

// -------- REPORT NORMALISER --------
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

    imagePath: source.imagePath ?? source.image_path ?? null
  };
}

// ---------------- LOAD FROM DB ON STARTUP ----------------
async function loadBountiesFromDB() {
  const rows = await all(`SELECT * FROM bounties`);
  memoryBounties.length = 0;
  for (const row of rows) {
    const b = normalizeBountyObject(row);
    if (b && b.id) {
      memoryBounties.push(b);
    }
  }
}

async function loadClaimsFromDB() {
  const rows = await all(`SELECT * FROM bounty_claims`);
  memoryClaims.length = 0;
  for (const row of rows) {
    const c = normalizeClaimObject(row);
    if (c) {
      memoryClaims.push(c);
    }
  }
}

// ---------------- DB PERSIST HELPERS ----------------
async function persistBountyToDb(bounty) {
  const b = normalizeBountyObject(bounty);
  await run(
    `INSERT OR REPLACE INTO bounties (
      id,
      guild_id,
      requester_id,
      requester_name,
      pokemons,
      notes,
      start_time,
      end_time,
      duration_hours,
      reward,
      rarity_key,
      rarity_label,
      starts_immediately,
      status,
      created_at,
      approved_at,
      request_thread_id,
      request_message_id,
      announcement_channel_id,
      announcement_message_id,
      card_channel_id,
      card_message_id,
      winner_id,
      winner_claim_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      b.id,
      b.guildId,
      b.requesterId,
      b.requesterName,
      JSON.stringify(b.pokemons || []),
      b.notes,
      b.startTime,
      b.endTime,
      b.durationHours,
      b.reward,
      b.rarityKey,
      b.rarityLabel,
      b.startsImmediately ? 1 : 0,
      b.status,
      b.createdAt,
      b.approvedAt,
      b.requestThreadId,
      b.requestMessageId,
      b.announcementChannelId,
      b.announcementMessageId,
      b.cardChannelId,
      b.cardMessageId,
      b.winnerId,
      b.winnerClaimId
    ]
  );

  const idx = memoryBounties.findIndex(x => x.id === b.id);
  if (idx === -1) memoryBounties.push(b);
  else memoryBounties[idx] = b;
  return b;
}

async function persistClaimToDb(claim) {
  let c = normalizeClaimObject(claim);

  if (c.id == null) {
    const res = await run(
      `INSERT INTO bounty_claims (
        bounty_id,
        hunter_id,
        pokemon_id,
        proof,
        status,
        created_at,
        resolved_at,
        resolver_id,
        claim_thread_id,
        claim_message_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        c.bountyId,
        c.hunterId,
        c.pokemonId,
        c.proof,
        c.status,
        c.createdAt,
        c.resolvedAt,
        c.resolverId,
        c.claimThreadId,
        c.claimMessageId
      ]
    );
    c.id = res.lastID;
  } else {
    await run(
      `UPDATE bounty_claims SET
        bounty_id = ?,
        hunter_id = ?,
        pokemon_id = ?,
        proof = ?,
        status = ?,
        created_at = ?,
        resolved_at = ?,
        resolver_id = ?,
        claim_thread_id = ?,
        claim_message_id = ?
       WHERE id = ?`,
      [
        c.bountyId,
        c.hunterId,
        c.pokemonId,
        c.proof,
        c.status,
        c.createdAt,
        c.resolvedAt,
        c.resolverId,
        c.claimThreadId,
        c.claimMessageId,
        c.id
      ]
    );
  }

  const idx = memoryClaims.findIndex(x => x.id === c.id);
  if (idx === -1) memoryClaims.push(c);
  else memoryClaims[idx] = c;
  return c.id;
}

// -------- REPORT PERSIST HELPER --------
async function persistReportToDb(report) {
  const r = normalizeReportObject(report);
  await run(
    `INSERT OR REPLACE INTO reports (
      id,
      guild_id,
      reporter_id,
      reporter_name,
      trainer_rank,
      pokemon_name,
      rarity_key,
      rarity_label,
      location,
      status,
      message_id,
      channel_id,
      points,
      expires_at,
      delete_at,
      created_at,
      image_path
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      r.id,
      r.guildId,
      r.reporterId,
      r.reporterName,
      r.trainerRank,
      r.pokemonName,
      r.rarityKey,
      r.rarityLabel,
      r.location,
      r.status,
      r.messageId,
      r.channelId,
      r.points,
      r.expiresAt,
      r.deleteAt,
      r.createdAt,
      r.imagePath
    ]
  );
  return r;
}

// ---------------- PUBLIC BOUNTY API ----------------
async function createBounty(bountyObj) {
  const norm = normalizeBountyObject({
    status: 'pending',
    createdAt: Date.now(),
    ...bountyObj
  });
  return await persistBountyToDb(norm);
}

async function getBountyById(id) {
  const inMem = memoryBounties.find(b => String(b.id) === String(id));
  if (inMem) return inMem;

  const row = await get(`SELECT * FROM bounties WHERE id = ?`, [id]);
  if (!row) return null;

  const norm = normalizeBountyObject(row);
  memoryBounties.push(norm);
  return norm;
}

async function updateBounty(id, patch) {
  const existing = await getBountyById(id);
  if (!existing) return null;

  const merged = normalizeBountyObject({ ...existing, ...patch });
  return await persistBountyToDb(merged);
}

async function getBountiesToStart(nowMs) {
  return memoryBounties.filter(b =>
    b.status === 'scheduled' &&
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

// ---------------- PUBLIC CLAIM API ----------------
async function createBountyClaim(claimObj) {
  const base = {
    status: 'pending',
    createdAt: Date.now(),
    ...claimObj
  };
  return await persistClaimToDb(base);
}

async function getBountyClaimById(id) {
  const inMem = memoryClaims.find(c => String(c.id) === String(id));
  if (inMem) return inMem;

  const row = await get(`SELECT * FROM bounty_claims WHERE id = ?`, [id]);
  if (!row) return null;

  const norm = normalizeClaimObject(row);
  memoryClaims.push(norm);
  return norm;
}

async function updateBountyClaim(id, patch) {
  const existing = await getBountyClaimById(id);
  if (!existing) return null;

  const merged = normalizeClaimObject({ ...existing, ...patch });
  await persistClaimToDb(merged);
}

async function getPendingClaimForBountyAndHunter(bountyId, hunterId) {
  return (
    memoryClaims.find(c =>
      String(c.bountyId) === String(bountyId) &&
      String(c.hunterId) === String(hunterId) &&
      c.status === 'pending'
    ) || null
  );
}

// ------------------------------------------------------
// PUBLIC REPORT API
// ------------------------------------------------------
async function createReport(reportObj) {
  const base = {
    status: reportObj.status || 'active',
    createdAt: reportObj.createdAt || Date.now(),
    ...reportObj
  };
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
    `SELECT * FROM reports
     WHERE status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at <= ?`,
    [nowMs]
  );
  return rows.map(normalizeReportObject);
}

async function getReportsToCleanup(nowMs) {
  const rows = await all(
    `SELECT * FROM reports
     WHERE status = 'expired'
       AND delete_at IS NOT NULL
       AND delete_at <= ?`,
    [nowMs]
  );
  return rows.map(normalizeReportObject);
}

async function findActiveReportThisHour(pokemonName, nowMs = Date.now()) {
  const name = String(pokemonName || "").toLowerCase();
  if (!name) return null;

  const hourStart = new Date(nowMs);
  hourStart.setMinutes(0, 0, 0);

  const row = await get(
    `SELECT * FROM reports
       WHERE status = 'active'
         AND LOWER(pokemon_name) = LOWER(?)
         AND created_at >= ?
       LIMIT 1`,
    [name, hourStart.getTime()]
  );

  return row ? normalizeReportObject(row) : null;
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

 // Points
getUserById,
getUserByUsername,
addPoints,
updateUserPoints,
updateLifetimePoints, // ⬅️ NEW EXPORT
getLeaderboard,
getAllUsers,
clearAllPoints,
incrementCompletedBounties,
getTotalCompletedBounties,

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
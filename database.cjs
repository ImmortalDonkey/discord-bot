// database.cjs
// ------------------------------------------------------
// POINTS + LOGS = SQLite
// BOUNTIES + CLAIMS = SQLite + in-memory cache
// REPORTS = SQLite
// PLAYER PROFILES (IGN LINKS) = SQLite
// MULTI-SERVER SUPPORT HELPERS = SQLite
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
// VORTEX ROAMER DEDUP HELPERS
// ------------------------------------------------------

async function hasVortexRoamer(roamerName, timeFound) {
  const row = await get(
    `SELECT 1 FROM vortex_roamers
     WHERE roamer_name = ? AND time_found = ?
     LIMIT 1`,
    [roamerName, timeFound]
  );
  return !!row;
}

async function insertVortexRoamer(roamerName, timeFound) {
  await run(
    `INSERT OR IGNORE INTO vortex_roamers (roamer_name, time_found)
     VALUES (?, ?)`,
    [roamerName, timeFound]
  );
}

// ------------------------------------------------------
// BOT META HELPERS (persistent bot state)
// ------------------------------------------------------
async function getMeta(key) {
  const row = await get(
    `SELECT value FROM bot_meta WHERE key = ?`,
    [key]
  );
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
  // -------- BOT META TABLE --------
  // (Was referenced by getMeta/setMeta; ensure it exists)
  await run(`CREATE TABLE IF NOT EXISTS bot_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

    // -------- VORTEX ROAMERS (API DEDUP) --------
  await run(`CREATE TABLE IF NOT EXISTS vortex_roamers (
    roamer_name TEXT NOT NULL,
    time_found TEXT NOT NULL,
    PRIMARY KEY (roamer_name, time_found)
  )`);

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

  // -------- PLAYER PROFILES (IGN LINKS) --------
  // One row per Discord user (global across all guilds)
  await run(`CREATE TABLE IF NOT EXISTS players (
    discord_id TEXT PRIMARY KEY,
    username TEXT,
    nickname TEXT,
    ign TEXT,
    ign_norm TEXT,
    created_at INTEGER,
    updated_at INTEGER
  )`);

  // Useful for case-insensitive lookup
  await run(`CREATE INDEX IF NOT EXISTS idx_players_ign_norm ON players(ign_norm)`);

  // Many-to-many: players <-> guilds
  // This is your foundation for multi-server fan-out (share reports to all guilds bot is in)
  await run(`CREATE TABLE IF NOT EXISTS player_guilds (
    discord_id TEXT,
    guild_id TEXT,
    joined_at INTEGER,
    last_seen INTEGER,
    PRIMARY KEY (discord_id, guild_id)
  )`);

  await run(`CREATE INDEX IF NOT EXISTS idx_player_guilds_guild ON player_guilds(guild_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_player_guilds_user ON player_guilds(discord_id)`);

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
// ⭐⭐ IGN-FIRST POINTS (CUMULATIVE PATCH) ⭐⭐
// - Stores IGN points in the SAME points/point_logs tables
// - Uses a synthetic key: discord_id = "ign:<ign_norm>"
// - Does NOT affect existing Discord-linked points
// ------------------------------------------------------

function ignToPointsKey(ign) {
  const norm = normalizeIgn(ign);
  if (!norm) return null;
  return `ign:${norm}`;
}

async function getIgnPointsRow(ign) {
  const key = ignToPointsKey(ign);
  if (!key) return null;
  return getUserById(key);
}

async function addIgnPoints(ign, delta, reason = '') {
  const key = ignToPointsKey(ign);
  if (!key) return null;

  // username column will store the display IGN (original casing if you pass it)
  const displayName = String(ign || "").trim() || key;

  // Reuse existing addPoints logic but under ign:<norm> identity
  return addPoints(key, displayName, delta, reason);
}

// ------------------------------------------------------
// PLAYER PROFILE (IGN) FUNCTIONS
// ------------------------------------------------------

function normalizeIgn(ign) {
  if (ign == null) return null;
  const s = String(ign).trim();
  if (!s) return null;
  return s.toLowerCase();
}

/**
 * Create or update a player's profile.
 * - discord_id is global
 * - ign is optional (can be null)
 */
async function upsertPlayerProfile({ discordId, username, nickname, ign }) {
  const now = Date.now();
  const ignStr = ign == null ? null : String(ign).trim();
  const ignNorm = normalizeIgn(ignStr);

  const existing = await get(`SELECT * FROM players WHERE discord_id = ?`, [discordId]);

  if (!existing) {
    await run(
      `INSERT INTO players (discord_id, username, nickname, ign, ign_norm, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [discordId, username || null, nickname || null, ignStr, ignNorm, now, now]
    );
  } else {
    // Only overwrite fields when values are provided (except ign which can be explicitly set to null)
    const newUsername = (username !== undefined) ? (username || null) : (existing.username || null);
    const newNickname = (nickname !== undefined) ? (nickname || null) : (existing.nickname || null);

    // If ign is undefined, keep existing; if null/empty, clear it; if set, update
    const setIgn = (ign !== undefined);
    const finalIgn = setIgn ? (ignStr || null) : (existing.ign || null);
    const finalIgnNorm = setIgn ? normalizeIgn(finalIgn) : (existing.ign_norm || null);

    await run(
      `UPDATE players
         SET username = ?,
             nickname = ?,
             ign = ?,
             ign_norm = ?,
             updated_at = ?
       WHERE discord_id = ?`,
      [newUsername, newNickname, finalIgn, finalIgnNorm, now, discordId]
    );
  }

  return getPlayerByDiscordId(discordId);
}

/**
 * Set or change IGN (used by /ign).
 */
async function setPlayerIgn(discordId, ign) {
  return upsertPlayerProfile({
    discordId,
    ign
  });
}

async function clearPlayerIgn(discordId) {
  return upsertPlayerProfile({
    discordId,
    ign: null
  });
}

async function getPlayerByDiscordId(discordId) {
  return await get(`SELECT * FROM players WHERE discord_id = ?`, [discordId]);
}

async function getPlayerByIgn(ign) {
  const norm = normalizeIgn(ign);
  if (!norm) return null;

  // Prefer normalized column
  const row = await get(
    `SELECT * FROM players WHERE ign_norm = ? LIMIT 1`,
    [norm]
  );
  return row || null;
}

/**
 * ⭐ NEW (CUMULATIVE PATCH):
 * Ensure an IGN exists in players table even with no Discord link.
 * This supports Case C: auto-create from API poll.
 *
 * - Uses a synthetic discord_id: "ign:<ign_norm>"
 * - This does NOT interfere with normal Discord user rows.
 */
async function ensureIgnProfileExists(ign) {
  const ignStr = String(ign || "").trim();
  const ignNorm = normalizeIgn(ignStr);
  if (!ignNorm) return null;

  const syntheticDiscordId = ignToPointsKey(ignStr); // ign:<norm>
  const existing = await getPlayerByDiscordId(syntheticDiscordId);
  if (existing) return existing;

  await upsertPlayerProfile({
    discordId: syntheticDiscordId,
    username: null,
    nickname: null,
    ign: ignStr
  });

  return getPlayerByDiscordId(syntheticDiscordId);
}

/**
 * Track that this user exists in this guild (and keep last_seen fresh).
 * Call this in places like:
 * - /report
 * - /claim
 * - guildMemberAdd event
 */
async function touchPlayerGuild(discordId, guildId) {
  const now = Date.now();

  await run(
    `INSERT OR IGNORE INTO player_guilds (discord_id, guild_id, joined_at, last_seen)
     VALUES (?, ?, ?, ?)`,
    [discordId, guildId, now, now]
  );

  await run(
    `UPDATE player_guilds
        SET last_seen = ?
      WHERE discord_id = ? AND guild_id = ?`,
    [now, discordId, guildId]
  );
}

async function getGuildIdsForPlayer(discordId) {
  const rows = await all(
    `SELECT guild_id FROM player_guilds WHERE discord_id = ?`,
    [discordId]
  );
  return rows.map(r => r.guild_id);
}

/**
 * Returns ALL guild IDs your bot has observed through interactions/events.
 * This becomes the base for “share report cards across all servers”.
 */
async function getAllKnownGuildIds() {
  const rows = await all(`SELECT DISTINCT guild_id FROM player_guilds`);
  return rows.map(r => r.guild_id);
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

  // Bot meta
  getMeta,
  setMeta,

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

  // ⭐⭐ IGN-first points (CUMULATIVE PATCH EXPORTS)
  getIgnPointsRow,
  addIgnPoints,
  ensureIgnProfileExists,

  // Player profiles (IGN)
  upsertPlayerProfile,
  setPlayerIgn,
  clearPlayerIgn,
  getPlayerByDiscordId,
  getPlayerByIgn,
  touchPlayerGuild,
  getGuildIdsForPlayer,
  getAllKnownGuildIds,

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
  findActiveReportThisHour,

  // Vortex API dedup
  hasVortexRoamer,
  insertVortexRoamer
};
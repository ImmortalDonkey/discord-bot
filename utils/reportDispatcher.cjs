const fs = require("fs");
const path = require("path");

const db = require("../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("./rarity.cjs");
const { calculateAwardedPoints } = require("./scoring.cjs");
const { getRankName } = require("./rankSystem.cjs");
const { createReportCard } = require("../renderers/reportCard.debug.cjs");
const { dispatchReport } = require("./reportDispatcher.cjs");
const {
  getChannelForRarity,
  getRoleForRarity
} = require("./reportChannelRouter.cjs");

/**
 * Normalizes a Pokémon/roamer name into env role format
 * ROLE_POKEMON_<NORMALIZED>
 */
function getPokemonRoleEnvKey(roamerName) {
  const normalized = String(roamerName || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `ROLE_POKEMON_${normalized}`;
}

/**
 * Discord snowflake validation
 */
function isValidSnowflake(id) {
  return typeof id === "string" && /^[0-9]{17,20}$/.test(id);
}

/**
 * Handles a single Vortex roamer entry
 * OPTION B:
 * - Main guild uses env-based roles
 * - Subscriber guilds use DB routing
 */
async function handleVortexRoamer(client, roamer) {
  if (!client) {
    console.warn("⚠ Vortex handler called without client");
    return;
  }

  const {
    roamer_name,
    time_found,
    location,
    found_by_username
  } = roamer;

  const ign = String(found_by_username || "").trim();
  if (!ign) {
    console.warn("⚠ Vortex roamer missing IGN, skipping:", roamer_name);
    return;
  }

  // ──────────────────────────────
  // DB-LEVEL DEDUP (AUTHORITATIVE)
  // ──────────────────────────────
  const exists = await db.hasVortexRoamer(roamer_name, time_found);
  if (exists) return;

  await db.insertVortexRoamer(roamer_name, time_found);

  // ──────────────────────────────
  // ENSURE IGN PROFILE EXISTS
  // ──────────────────────────────
  await db.ensureIgnProfileExists(ign);

  // ──────────────────────────────
  // OPTIONAL CARD PREFS (IGN → DISCORD)
  // ──────────────────────────────
  let reportCardPrefs = null;

  const linkedPlayer = await db.getPlayerByIgn(ign);
  if (
    linkedPlayer &&
    linkedPlayer.discord_id &&
    !linkedPlayer.discord_id.startsWith("ign:")
  ) {
    reportCardPrefs = await db.getReportCardPrefs(
      linkedPlayer.discord_id
    );
  }

  // ──────────────────────────────
  // RARITY + POINTS
  // ──────────────────────────────
  const rarityKey = getRarity(roamer_name);
  const rarityLabel = getRarityDisplayLabel(rarityKey);

  const now = new Date();
  const points = calculateAwardedPoints(rarityKey, now);

  const updated = await db.addIgnPoints(
    ign,
    points,
    `Vortex Auto Report: ${roamer_name}`
  );

  const trainerRank = getRankName(updated?.lifetime_points || 0);

  // ──────────────────────────────
  // EXPIRY WINDOW
  // ──────────────────────────────
  const expiresAt = new Date(now);
  expiresAt.setMinutes(59, 59, 999);

  const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;
  const reportId = `vortex_${Date.now()}`;

  // ──────────────────────────────
  // RENDER REPORT CARD (ONCE)
  // ──────────────────────────────
  const cardPath = await createReportCard({
    reportType: "encounter",
    reporterName: ign,
    reporterType: "ign",
    encountererName: ign,
    encountererType: "ign",
    pokemonName: roamer_name,
    location,
    rarityKey,
    rarityLabel,
    points,
    trainerRank,
    statusText: "Active",
    reportCardPrefs
  });

  // ──────────────────────────────
  // CREATE CANONICAL REPORT (NO MESSAGE YET)
  // ──────────────────────────────
  await db.createReport({
    id: reportId,
    reporterId: null,
    reporterName: ign,
    trainerRank,
    pokemonName: roamer_name,
    rarityKey,
    rarityLabel,
    location,
    status: "active",
    points,
    expiresAt: expiresAt.getTime(),
    deleteAt,
    createdAt: now.getTime(),
    imagePath: cardPath
  });

  // ──────────────────────────────
  // MAIN GUILD ROLE LOGIC (ENV)
  // ──────────────────────────────
  const pokemonEnvKey = getPokemonRoleEnvKey(roamer_name);
  const pokemonRoleIdRaw = process.env[pokemonEnvKey] || null;
  const rarityRoleIdRaw = getRoleForRarity(rarityKey);

  const pokemonRoleId = isValidSnowflake(pokemonRoleIdRaw)
    ? pokemonRoleIdRaw
    : null;

  const rarityRoleId = isValidSnowflake(rarityRoleIdRaw)
    ? rarityRoleIdRaw
    : null;

  const mainGuildMentions = [
    pokemonRoleId,
    rarityRoleId
  ].filter(Boolean);

  // ──────────────────────────────
  // DISPATCH (MAIN + SUBSCRIBERS)
  // ──────────────────────────────
  await dispatchReport({
    client,
    report: {
      id: reportId,
      rarityKey,
      pokemonKey: roamer_name
    },

    // ✅ CORRECT CONTRACT: buffer + filename
    renderCard: async () => ({
      buffer: fs.readFileSync(cardPath),
      filename: path.basename(cardPath)
    }),

    components: []
  });

  console.log(
    `🛰️ Vortex card dispatched: ${roamer_name} (${rarityKey})`
  );
}

module.exports = { handleVortexRoamer };
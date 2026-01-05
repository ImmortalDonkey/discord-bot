const db = require("../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("./rarity.cjs");
const { calculateAwardedPoints } = require("./scoring.cjs");
const { getRankName } = require("./rankSystem.cjs");
const { createReportCard } = require("../renderers/reportCard.debug.cjs");
const {
  getChannelForRarity,
  getRoleForRarity
} = require("./reportChannelRouter.cjs");

/**
 * Normalizes a Pokémon/roamer name into your env key format:
 *   ROLE_POKEMON_<NORMALIZED>
 *
 * Example:
 *   "Gimmighoul (Roaming)" -> ROLE_POKEMON_GIMMIGHOUL_ROAMING
 *   "XD001"                -> ROLE_POKEMON_XD001
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
 * Basic snowflake check (Discord IDs)
 */
function isValidSnowflake(id) {
  return typeof id === "string" && /^[0-9]{17,20}$/.test(id);
}

/**
 * Handles a single roamer entry from the Vortex API (LIVE FEED).
 * - DB dedup (authoritative)
 * - Auto-create IGN identity if missing
 * - Award points to IGN (IGN = source of truth)
 * - Route to rarity channel
 * - Ping Pokémon role + rarity role
 * - Apply user report card prefs if IGN linked to Discord
 * - DEV fallback if roles missing
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
  // ENSURE IGN IDENTITY EXISTS
  // (synthetic discord_id handled in DB layer)
  // ──────────────────────────────
  await db.ensureIgnProfileExists(ign);

  // ──────────────────────────────
  // OPTIONAL: USER CARD PREFS (IGN → DISCORD)
  // Only apply if IGN is linked to a REAL Discord user
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
  // ROUTE CHANNEL + ROLES
  // ──────────────────────────────
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) {
    console.warn("⚠ Vortex guild not found");
    return;
  }

  const channelId =
    getChannelForRarity(rarityKey) ||
    process.env.REPORT_CARD_CHANNEL_ID;

  const channel = await guild.channels
    .fetch(channelId)
    .catch(() => null);

  if (!channel) {
    console.warn("⚠ Vortex report channel not found");
    return;
  }

  // ✅ FIX: your env keys are ROLE_POKEMON_<NAME>, not ROLE_<NAME>
  const pokemonEnvKey = getPokemonRoleEnvKey(roamer_name);
  const pokemonRoleIdRaw = process.env[pokemonEnvKey] || null;

  // Keep router logic intact (source of truth for rarity role)
  const rarityRoleIdRaw = getRoleForRarity(rarityKey);

  // Validate IDs before using in mentions/allowedMentions
  const pokemonRoleId = isValidSnowflake(pokemonRoleIdRaw)
    ? pokemonRoleIdRaw
    : null;

  const rarityRoleId = isValidSnowflake(rarityRoleIdRaw)
    ? rarityRoleIdRaw
    : null;

  // ──────────────────────────────
  // BUILD REPORT CARD
  // (custom prefs applied if available)
  // ──────────────────────────────
  const expiresAt = new Date(now);
  expiresAt.setMinutes(59, 59, 999);

  const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;
  const reportId = `vortex_${Date.now()}`;

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

    // ✅ USER CONFIG (if linked)
    reportCardPrefs
  });

  // ──────────────────────────────
  // ROLE PINGS (DEV FALLBACK SAFE)
  // ──────────────────────────────
  const isDev =
    process.env.NODE_ENV !== "production" &&
    process.env.ENV !== "production";

  const mentionParts = [];

  // Pokémon role
  if (pokemonRoleId) {
    mentionParts.push(`<@&${pokemonRoleId}>`);
  } else if (isDev) {
    // Keep the dev fallback concept, but keep messages clean:
    // log it instead of polluting message content.
    console.warn(
      `⚠ Missing/invalid Pokémon role env: ${pokemonEnvKey} for "${roamer_name}"`
    );
  }

  // Rarity role
  if (rarityRoleId) {
    mentionParts.push(`<@&${rarityRoleId}>`);
  } else if (isDev) {
    console.warn(
      `⚠ Missing/invalid rarity role for rarityKey="${rarityKey}" (router returned: ${String(rarityRoleIdRaw)})`
    );
  }

  const sent = await channel.send({
    content: mentionParts.join(" "),
    allowedMentions: {
      roles: [pokemonRoleId, rarityRoleId].filter(Boolean)
    },
    files: [cardPath]
  });

  // ──────────────────────────────
  // PERSIST REPORT
  // reporterId intentionally NULL
  // ──────────────────────────────
  await db.createReport({
    id: reportId,
    guildId: guild.id,
    reporterId: null,
    reporterName: ign,
    trainerRank,
    pokemonName: roamer_name,
    rarityKey,
    rarityLabel,
    location,
    status: "active",
    messageId: sent.id,
    channelId: sent.channelId,
    points,
    expiresAt: expiresAt.getTime(),
    deleteAt,
    createdAt: now.getTime(),
    imagePath: cardPath
  });

  console.log(
    `🛰️ Vortex card posted: ${roamer_name} (${rarityKey})`
  );
}

module.exports = { handleVortexRoamer };

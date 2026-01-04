const db = require("../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("./rarity.cjs");
const { calculateAwardedPoints } = require("./scoring.cjs");
const { getRankName } = require("./rankSystem.cjs");
const { createReportCard } = require("../renderers/reportCard.debug.cjs");
const { getReportRouting } = require("./reportChannelRouter.cjs");

/**
 * Rarity → Discord role name
 */
const RARITY_ROLE_NAMES = {
  paradox: "Paradox",
  legendary: "Legendary",
  rare: "Rare",
  common: "Common",
  roamerMonth: "ROTM"
};

/**
 * Handles a single roamer entry from the Vortex API (LIVE).
 * - DB dedup
 * - Award points to IGN
 * - Route by rarity
 * - Ping Pokémon role + rarity role
 * - Post image only (no text beyond pings)
 */
async function handleVortexRoamer(client, roamer) {
  if (!client) return;

  const {
    roamer_name,
    time_found,
    location,
    found_by_username
  } = roamer;

  const ign = String(found_by_username || "").trim();
  if (!ign) return;

  // ──────────────────────────────
  // DB dedup
  // ──────────────────────────────
  const exists = await db.hasVortexRoamer(roamer_name, time_found);
  if (exists) return;

  await db.insertVortexRoamer(roamer_name, time_found);

  // ──────────────────────────────
  // Ensure IGN profile
  // ──────────────────────────────
  await db.ensureIgnProfileExists(ign);

  // ──────────────────────────────
  // Resolve guild
  // ──────────────────────────────
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

  // ──────────────────────────────
  // Rarity + points
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
  // Channel routing (rarity-based)
  // ──────────────────────────────
  const routing = getReportRouting(rarityKey, null);
  if (!routing.correctChannelId) return;

  const channel = await guild.channels
    .fetch(routing.correctChannelId)
    .catch(() => null);

  if (!channel) return;

  // ──────────────────────────────
  // Resolve roles
  // ──────────────────────────────

  // Pokémon role (exact name match)
  const pokemonRole = guild.roles.cache.find(
    r => r.name.toLowerCase() === roamer_name.toLowerCase()
  );

  // Rarity role
  const rarityRoleName = RARITY_ROLE_NAMES[rarityKey];
  const rarityRole = rarityRoleName
    ? guild.roles.cache.find(
        r => r.name.toLowerCase() === rarityRoleName.toLowerCase()
      )
    : null;

  const pingParts = [];
  if (pokemonRole) pingParts.push(`<@&${pokemonRole.id}>`);
  if (rarityRole) pingParts.push(`<@&${rarityRole.id}>`);

  const pingText = pingParts.length ? pingParts.join(" ") : undefined;

  // ──────────────────────────────
  // Expiry
  // ──────────────────────────────
  const expiresAt = new Date(now);
  expiresAt.setMinutes(59, 59, 999);
  const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;
  const reportId = `vortex_${Date.now()}`;

  // ──────────────────────────────
  // Render card
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
    statusText: "Active"
  });

  // ──────────────────────────────
  // SEND — PINGS + IMAGE ONLY
  // ──────────────────────────────
  const sent = await channel.send({
    content: pingText,
    files: [cardPath]
  });

  // ──────────────────────────────
  // Persist report
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

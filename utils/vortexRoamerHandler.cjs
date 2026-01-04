// utils/vortexRoamerHandler.cjs

const db = require("../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("./rarity.cjs");
const { calculateAwardedPoints } = require("./scoring.cjs");
const { getRankName } = require("./rankSystem.cjs");
const { createReportCard } = require("../renderers/reportCard.debug.cjs");

// ✅ SAME ROUTER USED BY LIVE /REPORT
const {
  getReportRouting
} = require("./reportChannelRouter.cjs");

/**
 * Handles a single roamer entry from the Vortex API (LIVE).
 * - DB dedup
 * - Auto-create IGN identity if missing
 * - Award points to IGN (IGN = source of truth)
 * - Route card by rarity
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
    found_by_username // IGN from Vortex API
  } = roamer;

  const ign = String(found_by_username || "").trim();
  if (!ign) {
    console.warn("⚠ Vortex roamer missing IGN, skipping:", roamer_name);
    return;
  }

  // ──────────────────────────────
  // DB-level dedup (authoritative)
  // ──────────────────────────────
  const exists = await db.hasVortexRoamer(roamer_name, time_found);
  if (exists) return;

  await db.insertVortexRoamer(roamer_name, time_found);

  // ──────────────────────────────
  // Ensure IGN identity exists
  // Uses synthetic discord_id: ign:<norm>
  // ──────────────────────────────
  await db.ensureIgnProfileExists(ign);

  // ──────────────────────────────
  // Resolve guild
  // ──────────────────────────────
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) {
    console.warn("⚠ Vortex guild not found");
    return;
  }

  // ──────────────────────────────
  // Rarity + points
  // ──────────────────────────────
  const rarityKey = getRarity(roamer_name);
  const rarityLabel = getRarityDisplayLabel(rarityKey);
  const now = new Date();
  const points = calculateAwardedPoints(rarityKey, now);

  // Award points to IGN (authoritative truth)
  const updated = await db.addIgnPoints(
    ign,
    points,
    `Vortex Auto Report: ${roamer_name}`
  );

  const trainerRank = getRankName(updated?.lifetime_points || 0);

  // ──────────────────────────────
  // ROUTING (RARITY → CHANNEL + ROLE)
  // ──────────────────────────────
  const routing = getReportRouting(
    rarityKey,
    null // no current channel — API sourced
  );

  if (!routing.correctChannelId) {
    console.warn(
      `⚠ No channel configured for rarity '${rarityKey}', skipping post`
    );
    return;
  }

  const channel = await guild.channels
    .fetch(routing.correctChannelId)
    .catch(() => null);

  if (!channel) {
    console.warn(
      `⚠ Routed channel not found for rarity '${rarityKey}'`
    );
    return;
  }

  // ──────────────────────────────
  // Expiry window (end of hour)
  // ──────────────────────────────
  const expiresAt = new Date(now);
  expiresAt.setMinutes(59, 59, 999);
  const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

  const reportId = `vortex_${Date.now()}`;

  // ──────────────────────────────
  // Build report card (IGN-FIRST)
  // Narrative:
  // "<ign> has found a roaming <pokemon>"
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
  // SEND (ROLE PING IF CONFIGURED)
  // ──────────────────────────────
  const sent = await channel.send({
    content: routing.roleId
      ? `🛰️ **Live Vortex Encounter** <@&${routing.roleId}>`
      : "🛰️ **Live Vortex Encounter**",
    files: [cardPath]
  });

  // ──────────────────────────────
  // Persist report
  // reporterId intentionally NULL (not Discord-linked)
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
    `🛰️ Vortex report posted: ${ign} encountered ${roamer_name} @ ${location} (+${points}) → ${rarityKey}`
  );
}

module.exports = { handleVortexRoamer };
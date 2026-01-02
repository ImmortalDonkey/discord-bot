// utils/vortexRoamerHandler.cjs

const db = require("../database.cjs");

const { getRankName } = require("./rankSystem.cjs");
const { getRarity, getRarityDisplayLabel } = require("./rarity.cjs");
const { calculateAwardedPoints } = require("./scoring.cjs");

const { createReportCard } = require("../renderers/reportCard.debug.cjs");

const REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

/**
 * Handles a single roamer entry from the Vortex API.
 * - DB dedup (authoritative)
 * - DEV-only: auto report + points
 */
async function handleVortexRoamer(roamer) {
  const { roamer_name, time_found, location } = roamer;

  // --------------------------------------------------
  // DB-level dedup (authoritative)
  // --------------------------------------------------
  const exists = await db.hasVortexRoamer(roamer_name, time_found);
  if (exists) return;

  await db.insertVortexRoamer(roamer_name, time_found);

  console.log(
    `🛰️ New roamer detected: ${roamer_name} @ ${location} (${time_found})`
  );

  // --------------------------------------------------
  // DEV-ONLY AUTO REPORT
  // --------------------------------------------------
  const isDev =
    process.env.NODE_ENV === "dev" ||
    process.env.ENV === "dev";

  if (!isDev) return;
  if (process.env.VORTEX_API_AUTO_REPORT !== "true") return;
  if (!REPORT_CHANNEL_ID) return;

  try {
    const now = new Date();

    // -------------------------------
    // RARITY + POINTS (PARITY)
    // -------------------------------
    const rarityKey = getRarity(roamer_name);
    const rarityLabel = getRarityDisplayLabel(rarityKey);
    const awardedPoints = calculateAwardedPoints(rarityKey, now);

    // -------------------------------
    // AWARD POINTS (VORTEX USER)
    // -------------------------------
    const vortexUserId = "vortex";
    const vortexUsername = "Vortex API";

    const updatedUser = await db.addPoints(
      vortexUserId,
      vortexUsername,
      awardedPoints,
      `Vortex Auto Report: ${roamer_name}`
    );

    const trainerRank = getRankName(updatedUser?.lifetime_points || 0);

    // -------------------------------
    // EXPIRY WINDOW (MATCH LIVE)
    // -------------------------------
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);
    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

    const reportId = `report_${Date.now()}_vortex`;

    // -------------------------------
    // BUILD REPORT CARD
    // -------------------------------
    const cardPath = await createReportCard({
      reportType: "encounter",
      reporterName: "Vortex API",
      reporterType: "system",
      encountererName: "Vortex API",
      encountererType: "system",
      pokemonName: roamer_name,
      location,
      rarityKey,
      rarityLabel,
      points: awardedPoints,
      trainerRank,
      statusText: "Active"
    });

    // -------------------------------
    // POST TO DEV REPORT CHANNEL
    // -------------------------------
    const guildId = process.env.GUILD_ID;
    const client = require("../index.cjs")?.client;

    // Fallback: fetch via cache through any connected guild
    let targetChannel = null;
    for (const guild of client?.guilds?.cache?.values() || []) {
      targetChannel = await guild.channels
        .fetch(REPORT_CHANNEL_ID)
        .catch(() => null);
      if (targetChannel) break;
    }

    if (!targetChannel) {
      console.warn("⚠ Vortex report channel not found");
      return;
    }

    const sent = await targetChannel.send({
      files: [cardPath]
    });

    // -------------------------------
    // SAVE REPORT (LIVE SCHEMA)
    // -------------------------------
    await db.createReport({
      id: reportId,
      guildId: targetChannel.guild.id,
      reporterId: vortexUserId,
      reporterName: "Vortex API",
      trainerRank,
      pokemonName: roamer_name,
      rarityKey,
      rarityLabel,
      location,
      status: "active",
      messageId: sent.id,
      channelId: sent.channelId,
      points: awardedPoints,
      expiresAt: expiresAt.getTime(),
      deleteAt,
      createdAt: now.getTime(),
      imagePath: cardPath
    });

    console.log(
      `📨 Vortex report posted: ${roamer_name} (+${awardedPoints} pts)`
    );

  } catch (err) {
    console.error("❌ Vortex auto report failed:", err);
  }
}

module.exports = {
  handleVortexRoamer
};

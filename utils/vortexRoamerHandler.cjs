const fs = require("fs");
const path = require("path");

const db = require("../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("./rarity.cjs");
const { calculateAwardedPoints } = require("./scoring.cjs");
const { getRankName } = require("./rankSystem.cjs");
const { createReportCard } = require("../renderers/reportCard.debug.cjs");

/**
 * Handles a single Vortex roamer entry
 *
 * OPTION B (LOCKED):
 * - Main guild → env-based rarity routing
 * - Subscriber guilds → DB-based single-channel fan-out
 *
 * NOTE:
 * dispatchReport is REQUIRED via lazy-require to break
 * circular dependencies with the watcher/dispatcher stack.
 */
async function handleVortexRoamer(client, roamer) {
  // ✅ LAZY REQUIRE (CRITICAL – DO NOT MOVE)
  // IMPORTANT: We must call the REPORT sender (posts to Discord),
  // not the Vortex ingestion dispatcher.
  const { dispatchReport } = require("./reportDispatcher.cjs");

  if (!client) {
    console.warn("⚠ Vortex handler called without client");
    return;
  }

  if (!roamer || !roamer.roamer_name) {
    console.warn("⚠ Invalid roamer payload (missing name):", roamer);
    return;
  }

  const {
    roamer_name,
    location,
    found_by_username,
    _timeFoundMs
  } = roamer;

  // ──────────────────────────────
  // NORMALISED TIMESTAMP (REQUIRED)
  // ──────────────────────────────
  const time_found = _timeFoundMs;

  if (!time_found || typeof time_found !== "number") {
    console.warn(
      "⚠ Invalid roamer payload (missing normalised timestamp):",
      roamer
    );
    return;
  }

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
  // DISPATCH TO DISCORD (POSTS MESSAGE)
  // ──────────────────────────────
  await dispatchReport({
    client,
    report: {
      id: reportId,
      rarityKey,
      pokemonKey: roamer_name
    },

    // Dispatcher contract: buffer + filename
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

module.exports = {
  handleVortexRoamer
};
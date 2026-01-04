// utils/reportScheduler.cjs
// Expire & cleanup reports using normalised camelCase fields

const fs = require("fs");
const db = require("../database.cjs");

// ⬇️ IMPORTANT: use SAME renderer as active cards
const { createReportCard } = require("../renderers/reportCard.debug.cjs");

/**
 * Expire reports whose hour has ended
 * Re-render → update message → update DB
 */
async function expireDueReports(client, nowMs) {
  const dueReports = await db.getReportsToExpire(nowMs);
  if (!dueReports.length) return;

  console.log(`⏳ Expiring ${dueReports.length} report(s)...`);

  for (const r of dueReports) {
    try {
      const channel = await client.channels
        .fetch(r.channelId)
        .catch(() => null);

      if (!channel) {
        console.warn("⚠ Channel missing for report", r.id);
        continue;
      }

      const oldMsg = await channel.messages
        .fetch(r.messageId)
        .catch(() => null);

      if (!oldMsg) {
        console.warn("⚠ Message missing for report", r.id);
        continue;
      }

      // ──────────────────────────────
      // RE-RENDER CARD (EXPIRED)
      // SAME renderer + same shape as active
      // ──────────────────────────────
      const newCardPath = await createReportCard({
        reporterName: r.reporterName,
        reporterId: r.reporterId || null,
        pokemonName: r.pokemonName,
        location: r.location,
        rarityKey: r.rarityKey,
        rarityLabel: r.rarityLabel,
        points: r.points,
        trainerRank: r.trainerRank || "Trainer",
        statusText: "Expired",              // ⬅️ LOCKED casing
        reportCardPrefs: r.reportCardPrefs  // may be undefined (safe)
      });

      // Update message → new image, remove buttons
      await oldMsg.edit({
        files: [newCardPath],
        components: []
      });

      // Delete old local PNG
      if (r.imagePath && fs.existsSync(r.imagePath)) {
        fs.unlinkSync(r.imagePath);
      }

      // Update DB
      await db.updateReport(r.id, {
        status: "expired",
        imagePath: newCardPath
      });

      console.log(`✔ Report expired: ${r.id}`);
    } catch (err) {
      console.error(`❌ Expire error for ${r.id}:`, err);
    }
  }
}

/**
 * Delete expired reports older than 24 hours
 */
async function cleanupReports(client, nowMs) {
  const stale = await db.getReportsToCleanup(nowMs);
  if (!stale.length) return;

  console.log(`🗑 Cleaning ${stale.length} stale report(s)...`);

  for (const r of stale) {
    try {
      const channel = await client.channels
        .fetch(r.channelId)
        .catch(() => null);

      if (channel) {
        const msg = await channel.messages
          .fetch(r.messageId)
          .catch(() => null);

        if (msg) await msg.delete().catch(() => {});
      }

      if (r.imagePath && fs.existsSync(r.imagePath)) {
        fs.unlinkSync(r.imagePath);
      }

      await db.deleteReport(r.id);
      console.log(`✔ Deleted stale report ${r.id}`);
    } catch (err) {
      console.error(`❌ Cleanup error for ${r.id}:`, err);
    }
  }
}

/**
 * Called from index.cjs on interval (e.g. every 60s)
 */
async function runReportScheduler(client) {
  const nowMs = Date.now();
  await expireDueReports(client, nowMs);
  await cleanupReports(client, nowMs);
}

module.exports = {
  runReportScheduler
};
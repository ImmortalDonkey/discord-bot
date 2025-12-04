// utils/reportScheduler.cjs
// Expire & cleanup reports using normalized camelCase fields

const fs = require("fs");
const db = require("../database.cjs");
const { createReportCard } = require("../renderers/reportCard.cjs");

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
      const channel = await client.channels.fetch(r.channelId).catch(() => null);
      if (!channel) {
        console.warn("⚠ Channel missing for report", r.id);
        continue;
      }

      const oldMsg = await channel.messages.fetch(r.messageId).catch(() => null);
      if (!oldMsg) {
        console.warn("⚠ Message missing for report", r.id);
        continue;
      }

      // Re-render with EXPIRED status
      const newCardPath = await createReportCard({
        trainerName: r.reporterName,
        trainerRank: r.trainerRank || "Trainer",
        pokemonName: r.pokemonName,
        rarityKey: r.rarityKey,
        rarityLabel: r.rarityLabel,
        points: r.points,
        location: r.location,
        statusText: "Expired"
      });

      // Remove buttons + update card only
      await oldMsg.edit({
        files: [newCardPath],
        components: []
      });

      // Delete old card image
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
 * Delete expired+stale reports (24hr cleanup)
 */
async function cleanupReports(client, nowMs) {
  const stale = await db.getReportsToCleanup(nowMs);
  if (!stale.length) return;

  console.log(`🗑 Cleaning ${stale.length} stale report(s)...`);

  for (const r of stale) {
    try {
      const channel = await client.channels.fetch(r.channelId).catch(() => null);
      if (channel) {
        const msg = await channel.messages.fetch(r.messageId).catch(() => null);
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
 * Called from index.cjs on interval
 */
async function runReportScheduler(client) {
  const nowMs = Date.now();
  await expireDueReports(client, nowMs);
  await cleanupReports(client, nowMs);
}

module.exports = {
  runReportScheduler
};
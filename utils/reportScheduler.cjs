// utils/reportScheduler.cjs
// Handles EXPIRY + CLEANUP for reports

const path = require("path");
const fs = require("fs");

const db = require("../database.cjs");
const { createReportCard } = require("../renderers/reportCard.cjs");

/**
 * Expire reports when their hour ends
 *   - updates card message with Expired version
 *   - sets DB.status = "expired"
 */
async function expireDueReports(client, nowMs) {
  const dueReports = await db.getReportsToExpire(nowMs);
  if (!dueReports.length) return;

  console.log(`⏳ Expiring ${dueReports.length} report(s)...`);

  for (const r of dueReports) {
    try {
      const channel = await client.channels.fetch(r.channelId).catch(() => null);
      if (!channel) {
        console.warn(`⚠ Channel missing for report ${r.id}`);
        continue;
      }

      const oldMsg = await channel.messages.fetch(r.messageId).catch(() => null);
      if (!oldMsg) {
        console.warn(`⚠ Message missing for report ${r.id}`);
        continue;
      }

      // Re-render card with new status
      const cardPath = await createReportCard({
        trainerName: r.reporterName,
        trainerRank: r.trainerRank || "Trainer",
        pokemonName: r.pokemonName,
        rarityKey: r.rarityKey,
        rarityLabel: r.rarityLabel,
        points: r.points,
        location: r.location,
        statusText: "Expired"
      });

      await oldMsg.edit({
        content: `⚠ **Expired**`,
        files: [cardPath]
      });

      // Update DB
      await db.updateReport(r.id, {
        status: "expired",
        imagePath: cardPath
      });

      console.log(`✔ Report ${r.id} expired and message updated.`);
    } catch (err) {
      console.error(`❌ Expire error for report ${r.id}:`, err);
    }
  }
}

/**
 * Cleanup older expired reports (keep 24h after expiry)
 * - deletes message + image + DB row
 */
async function cleanupReports(client, nowMs) {
  const stale = await db.getReportsToCleanup(nowMs);
  if (!stale.length) return;

  console.log(`🗑 Removing ${stale.length} expired report(s)...`);

  for (const r of stale) {
    try {
      // Remove discord message if still exists
      const channel = await client.channels.fetch(r.channelId).catch(() => null);

      if (channel) {
        const msg = await channel.messages.fetch(r.messageId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }

      // Delete saved image
      if (r.imagePath && fs.existsSync(r.imagePath)) {
        fs.unlinkSync(r.imagePath);
      }

      // Delete DB entry
      await db.deleteReport(r.id);

      console.log(`✔ Fully removed report ${r.id}`);
    } catch (err) {
      console.error(`❌ Cleanup error ${r.id}:`, err);
    }
  }
}

/**
 * Main run — called from index.js every 60 seconds
 */
async function runReportScheduler(client) {
  const nowMs = Date.now();

  await expireDueReports(client, nowMs);
  await cleanupReports(client, nowMs);
}

module.exports = {
  runReportScheduler
};

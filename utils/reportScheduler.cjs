// utils/reportScheduler.cjs
// Handles automatic report expiry & cleanup
// Normalized camelCase everywhere

const fs = require("fs");
const db = require("../database.cjs");
const { createReportCard } = require("../renderers/reportCard.cjs");

/**
 * Expire reports at end of their active hour.
 * → Remove buttons
 * → Re-render card (Status: Expired)
 * → Update DB with deleteAt timestamp
 */
async function expireDueReports(client, nowMs) {
  const dueReports = await db.getReportsToExpire(nowMs);
  if (!dueReports.length) return;

  console.log(`⏳ [ReportScheduler] Expiring ${dueReports.length} report(s)...`);

  for (const r of dueReports) {
    try {
      const {
        id,
        channelId,
        messageId,
        imagePath,
        reporterName,
        trainerRank,
        pokemonName,
        rarityKey,
        rarityLabel,
        points,
        location
      } = r;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        console.warn(`⚠ Channel missing for report ${id}`);
        continue;
      }

      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (!msg) {
        console.warn(`⚠ Message missing for report ${id}`);
        continue;
      }

      const updatedCardPath = await createReportCard({
        trainerName,
        trainerRank: trainerRank || "Trainer",
        pokemonName,
        rarityKey,
        rarityLabel,
        points,
        location,
        statusText: "Expired"
      });

      // Replace message card & REMOVE BUTTONS
      await msg.edit({
        files: [updatedCardPath],
        components: [] // button removal
      });

      // Delete previous PNG from disk
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }

      // Update DB status and schedule cleanup in 24h
      const deleteAt = nowMs + 24 * 60 * 60 * 1000;
      await db.updateReport(id, {
        status: "expired",
        imagePath: updatedCardPath,
        deleteAt
      });

      console.log(`✔ Expired report ${id}`);

    } catch (err) {
      console.error(`❌ Expire error (${r.id}):`, err);
    }
  }
}


/**
 * Auto-delete expired reports older than 24h
 * → Delete message
 * → Delete local image
 * → Remove from DB
 */
async function cleanupReports(client, nowMs) {
  const stale = await db.getReportsToCleanup(nowMs);
  if (!stale.length) return;

  console.log(`🗑 [ReportScheduler] Cleaning ${stale.length} stale report(s)...`);

  for (const r of stale) {
    try {
      const { id, channelId, messageId, imagePath } = r;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel) {
        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }

      // Delete saved card image
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }

      // Delete DB row
      await db.deleteReport(id);

      console.log(`✔ Deleted stale report ${id}`);

    } catch (err) {
      console.error(`❌ Cleanup error for ${r.id}:`, err);
    }
  }
}


/**
 * Public entry — called every 60 seconds from index.cjs
 */
async function runReportScheduler(client) {
  const nowMs = Date.now();
  await expireDueReports(client, nowMs);
  await cleanupReports(client, nowMs);
}

module.exports = {
  runReportScheduler
};
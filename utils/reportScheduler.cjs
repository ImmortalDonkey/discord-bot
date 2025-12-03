// utils/reportScheduler.cjs
// Expire & cleanup reports (independent of bounty logic)

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
      const channelId = r.channel_id;
      const messageId = r.message_id;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        console.warn(`⚠ Channel missing for report ${r.id}`);
        continue;
      }

      const oldMsg = await channel.messages.fetch(messageId).catch(() => null);
      if (!oldMsg) {
        console.warn(`⚠ Message missing for report ${r.id}`);
        continue;
      }

      // Re-render card
      const cardPath = await createReportCard({
        trainerName: r.reporter_name,
        trainerRank: r.trainer_rank || "Trainer",
        pokemonName: r.pokemon_name,
        rarityKey: r.rarity_key,
        rarityLabel: r.rarity_label,
        points: r.points,
        location: r.location,
        statusText: "Expired"
      });

      await oldMsg.edit({
        content: `⚠️ **Expired**`,
        files: [cardPath]
      });

      // Update DB: mark expired + save new image path
      const expireAt = Date.now();
      await db.updateReport(r.id, {
        status: "expired",
        image_path: cardPath,
        expire_at: expireAt
      });

      console.log(`✔ Report ${r.id} expired`);
    } catch (err) {
      console.error(`❌ Expire error for report ${r.id}:`, err);
    }
  }
}


/**
 * Delete expired reports older than 24 hours
 */
async function cleanupReports(client, nowMs) {
  const stale = await db.getReportsToCleanup(nowMs);
  if (!stale.length) return;

  console.log(`🗑 Removing ${stale.length} stale report(s)...`);

  for (const r of stale) {
    try {
      const channelId = r.channel_id;
      const messageId = r.message_id;

      // Remove Discord message if exists
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel) {
        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }

      // Delete image if exists
      if (r.image_path && fs.existsSync(r.image_path)) {
        fs.unlinkSync(r.image_path);
      }

      // Remove DB row
      await db.deleteReport(r.id);

      console.log(`✔ Deleted report ${r.id}`);
    } catch (err) {
      console.error(`❌ Cleanup error ${r.id}:`, err);
    }
  }
}


/**
 * Called from index.js every 60 seconds
 */
async function runReportScheduler(client) {
  const nowMs = Date.now();
  await expireDueReports(client, nowMs);
  await cleanupReports(client, nowMs);
}

module.exports = {
  runReportScheduler
};

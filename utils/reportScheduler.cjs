// utils/reportScheduler.cjs
// Expire & cleanup reports using normalised camelCase fields

const fs = require("fs");
const db = require("../database.cjs");

// ⬇️ IMPORTANT: use SAME renderer as active cards
const { createReportCard } = require("../renderers/reportCard.debug.cjs");

/**
 * Resolve all messages that belong to a report.
 * - If report_messages has mappings → return all mapped messages (subscriber + main)
 * - Else fallback to legacy single message (reports.channelId/messageId)
 */
async function getReportTargets(r) {
  try {
    const mappings =
      typeof db.getReportMessageMappings === "function"
        ? await db.getReportMessageMappings(r.id)
        : [];

    if (Array.isArray(mappings) && mappings.length > 0) {
      return mappings.map((m) => ({
        channelId: m.channel_id,
        messageId: m.message_id
      }));
    }
  } catch (err) {
    console.warn("⚠ Failed to read report message mappings for", r.id, err);
  }

  // Legacy fallback
  if (r.channelId && r.messageId) {
    return [{ channelId: r.channelId, messageId: r.messageId }];
  }

  return [];
}

/**
 * Expire reports whose hour has ended
 * Re-render → update message(s) → update DB
 */
async function expireDueReports(client, nowMs) {
  const dueReports = await db.getReportsToExpire(nowMs);
  if (!dueReports.length) return;

  console.log(`⏳ Expiring ${dueReports.length} report(s)...`);

  for (const r of dueReports) {
    try {
      const targets = await getReportTargets(r);

      if (!targets.length) {
        console.warn("⚠ No message targets found for report", r.id);
        // Still mark expired so it doesn't loop forever
        await db.updateReport(r.id, { status: "expired" });
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

      // Update ALL messages (main + subscribers if mapped)
      for (const t of targets) {
        const channel = await client.channels.fetch(t.channelId).catch(() => null);
        if (!channel) {
          console.warn("⚠ Channel missing for report", r.id, "channel", t.channelId);
          continue;
        }

        const msg = await channel.messages.fetch(t.messageId).catch(() => null);
        if (!msg) {
          console.warn("⚠ Message missing for report", r.id, "message", t.messageId);
          continue;
        }

        await msg.edit({
          files: [newCardPath],
          components: []
        });
      }

      // Delete old local PNG (previous card)
      if (r.imagePath && fs.existsSync(r.imagePath)) {
        fs.unlinkSync(r.imagePath);
      }

      // Update canonical report row
      await db.updateReport(r.id, {
        status: "expired",
        imagePath: newCardPath
      });

      console.log(`✔ Report expired: ${r.id} (updated ${targets.length} msg(s))`);
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
      const targets = await getReportTargets(r);

      // Delete ALL mapped messages (or legacy single)
      for (const t of targets) {
        const channel = await client.channels.fetch(t.channelId).catch(() => null);
        if (!channel) continue;

        const msg = await channel.messages.fetch(t.messageId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }

      // Delete local PNG
      if (r.imagePath && fs.existsSync(r.imagePath)) {
        fs.unlinkSync(r.imagePath);
      }

      // deleteReport already deletes report_messages first
      await db.deleteReport(r.id);

      console.log(`✔ Deleted stale report ${r.id} (deleted ${targets.length} msg(s))`);
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
// utils/reportScheduler.cjs
// Expire & cleanup reports (scheduler is guild-agnostic)

const fs = require("fs");
const path = require("path");
const db = require("../database.cjs");

// IMPORTANT: same renderer as active cards
const { createReportCard } = require("../renderers/reportCard.debug.cjs");

/**
 * Resolve all messages that belong to a report.
 * Supports multi-message mapping but does not care about guilds.
 */
async function getReportTargets(r) {
  try {
    if (typeof db.getReportMessageMappings === "function") {
      const mappings = await db.getReportMessageMappings(r.id);
      if (Array.isArray(mappings) && mappings.length > 0) {
        return mappings.map(m => ({
          channelId: m.channel_id,
          messageId: m.message_id
        }));
      }
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
 * Expire reports whose active window has ended
 * - Re-render card
 * - Edit all messages
 * - Update DB
 */
async function expireDueReports(client, nowMs) {
  const dueReports = await db.getReportsToExpire(nowMs);
  if (!dueReports.length) return;

  console.log(`⏳ Expiring ${dueReports.length} report(s)...`);

  for (const r of dueReports) {
    try {
      const targets = await getReportTargets(r);

      if (!targets.length) {
        await db.updateReport(r.id, { status: "expired" });
        continue;
      }

      // Re-render expired card
      const newCardPath = await createReportCard({
        reporterName: r.reporterName,
        reporterId: r.reporterId || null,
        pokemonName: r.pokemonName,
        location: r.location,
        rarityKey: r.rarityKey,
        rarityLabel: r.rarityLabel,
        points: r.points,
        trainerRank: r.trainerRank || "Trainer",
        statusText: "Expired",
        reportCardPrefs: r.reportCardPrefs
      });

      const buffer = fs.readFileSync(newCardPath);
      const filename = path.basename(newCardPath);

      // Update all messages in-place
      for (const t of targets) {
        const channel = await client.channels.fetch(t.channelId).catch(() => null);
        if (!channel) continue;

        const msg = await channel.messages.fetch(t.messageId).catch(() => null);
        if (!msg) continue;

        await msg.edit({
          files: [{ attachment: buffer, name: filename }],
          components: []
        });
      }

      // Delete previous local PNG
      if (r.imagePath && fs.existsSync(r.imagePath)) {
        fs.unlinkSync(r.imagePath);
      }

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
 * Cleanup reports after retention window
 * - NO Discord deletes
 * - YES DB delete
 * - YES PNG delete (Pi only)
 *
 * Retention: 2 hours after creation
 */
async function cleanupReports(nowMs) {
  const stale = await db.getReportsToCleanup(nowMs);
  if (!stale.length) return;

  console.log(`🗑 Cleaning ${stale.length} stale report(s)...`);

  for (const r of stale) {
    try {
      if (r.imagePath && fs.existsSync(r.imagePath)) {
        fs.unlinkSync(r.imagePath);
      }

      await db.deleteReport(r.id);

      console.log(`✔ Cleaned stale report ${r.id} (DB + PNG only)`);
    } catch (err) {
      console.error(`❌ Cleanup error for ${r.id}:`, err);
    }
  }
}

/**
 * Expire onboarding sessions older than 10 minutes.
 * Assigns guest role and archives thread.
 */
async function expireOnboardingSessions(client, nowMs) {
  const cutoff = nowMs - 10 * 60 * 1000;
  let sessions;
  try {
    sessions = await db.getExpiredOnboardingSessions(cutoff);
  } catch { return; }
  if (!sessions.length) return;

  for (const s of sessions) {
    try {
      const guild = await client.guilds.fetch(s.guild_id).catch(() => null);
      if (!guild) continue;

      const config = await db.getOnboardingConfig(s.guild_id).catch(() => null);

      if (config?.guest_role_id) {
        const member = await guild.members.fetch(s.discord_id).catch(() => null);
        if (member) {
          await member.roles.add(config.guest_role_id).catch(() => {});
        }
      }

      if (s.thread_id) {
        const thread = await client.channels.fetch(s.thread_id).catch(() => null);
        if (thread?.isThread()) {
          await thread.send('⏰ Onboarding timed out — you\'ve been assigned as a guest. You can update your roles in the roles channel.').catch(() => {});
          await thread.setArchived(true).catch(() => {});
        }
      }

      await db.upsertOnboardingSession({
        discordId: s.discord_id,
        guildId: s.guild_id,
        completed: 1
      });

      console.log(`[onboarding] session timed out — ${s.discord_id} in guild ${s.guild_id}`);
    } catch (err) {
      console.error(`[onboarding] timeout error for ${s.discord_id}:`, err);
    }
  }
}

/**
 * Called from index.cjs on interval (e.g. every 60s)
 */
async function runReportScheduler(client) {
  const nowMs = Date.now();
  await expireDueReports(client, nowMs);
  await cleanupReports(nowMs);
  await expireOnboardingSessions(client, nowMs);
}

module.exports = {
  runReportScheduler
};
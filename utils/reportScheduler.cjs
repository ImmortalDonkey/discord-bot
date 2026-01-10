// utils/reportScheduler.cjs

const db = require('../database.cjs');
const { renderReportCard } = require('../renderers/reportCard.cjs');

/**
 * Periodically checks for expired reports and re-renders them
 * across ALL guilds (main + subscribers).
 */
async function runReportScheduler(client) {
  console.log('[SCHEDULER] Report scheduler started');

  setInterval(async () => {
    try {
      const expiredReports = await db.getExpiredReports();
      if (!expiredReports || expiredReports.length === 0) return;

      for (const report of expiredReports) {
        try {
          console.log('[SCHEDULER] Expiring report', report.id);

          // Re-render expired card ONCE
          const { buffer, filename } = await renderReportCard({
            ...report,
            expired: true
          });

          // 1️⃣ Try global fan-out mappings first
          const mappings =
            typeof db.getReportMessageMappings === 'function'
              ? await db.getReportMessageMappings(report.id)
              : [];

          if (mappings && mappings.length > 0) {
            // Update every mapped message
            for (const m of mappings) {
              try {
                const guild = await client.guilds.fetch(m.guild_id);
                if (!guild) continue;

                const channel = await guild.channels.fetch(m.channel_id);
                if (!channel || !channel.isTextBased()) continue;

                const message = await channel.messages.fetch(m.message_id);
                if (!message) continue;

                await message.edit({
                  files: [{ attachment: buffer, name: filename }],
                  components: [] // remove buttons on expiry
                });
              } catch (err) {
                console.warn(
                  '[SCHEDULER] Failed to update mapped message',
                  m.message_id,
                  err.message
                );
              }
            }
          } else {
            // 2️⃣ Legacy fallback (single-message reports)
            try {
              const guild = await client.guilds.fetch(report.guild_id);
              if (!guild) continue;

              const channel = await guild.channels.fetch(report.channel_id);
              if (!channel || !channel.isTextBased()) continue;

              const message = await channel.messages.fetch(report.message_id);
              if (!message) continue;

              await message.edit({
                files: [{ attachment: buffer, name: filename }],
                components: []
              });
            } catch (err) {
              console.warn(
                '[SCHEDULER] Failed to update legacy report',
                report.id,
                err.message
              );
            }
          }

          // Mark report expired (once, canonical)
          await db.markReportExpired(report.id);
        } catch (err) {
          console.error('[SCHEDULER] Error expiring report', report.id, err);
        }
      }
    } catch (err) {
      console.error('[SCHEDULER] Scheduler loop error', err);
    }
  }, 60 * 1000); // every minute
}

module.exports = {
  runReportScheduler
};
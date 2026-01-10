// utils/reportDispatcher.cjs

const db = require('../database.cjs');
const { getReportRouting } = require('./reportChannelRouter.cjs');

/**
 * Dispatch a report to:
 * - MAIN guild (always)
 * - ALL enabled subscriber guilds (DB)
 *
 * @param {Object} options
 * @param {Object} options.client Discord client
 * @param {Object} options.report Canonical report object (id, rarityKey, pokemonKey, etc.)
 * @param {Function} options.renderCard async () => { buffer, filename }
 * @param {Object} options.components Discord buttons
 */
async function dispatchReport({
  client,
  report,
  renderCard,
  components = []
}) {
  const MAIN_GUILD_ID = process.env.GUILD_ID;

  if (!MAIN_GUILD_ID) {
    throw new Error('GUILD_ID env var not set (main guild)');
  }

  // 1️⃣ Build destination list (LOCKED RULE)
  const subscribers =
    typeof db.getEnabledSubscriberGuilds === 'function'
      ? await db.getEnabledSubscriberGuilds()
      : [];

  const destinationGuildIds = [
    MAIN_GUILD_ID,
    ...subscribers.map(g => g.guild_id)
  ];

  // Deduplicate (safety)
  const uniqueGuildIds = [...new Set(destinationGuildIds)];

  console.log('[DISPATCH] Report', report.id, '→ guilds:', uniqueGuildIds.length);

  // 2️⃣ Render card ONCE
  const { buffer, filename } = await renderCard();

  // 3️⃣ Dispatch to each guild
  for (const guildId of uniqueGuildIds) {
    try {
      const guild = await client.guilds.fetch(guildId);
      if (!guild) continue;

      const {
        channelId,
        rarityRoleId,
        pokemonRoleId
      } = await getReportRouting({
        guildId,
        rarityKey: report.rarityKey,
        pokemonKey: report.pokemonKey
      });

      if (!channelId) continue;

      const channel = await guild.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) continue;

      const mentions = [];
      if (rarityRoleId) mentions.push(`<@&${rarityRoleId}>`);
      if (pokemonRoleId) mentions.push(`<@&${pokemonRoleId}>`);

      const message = await channel.send({
        content: mentions.join(' ') || null,
        files: [{ attachment: buffer, name: filename }],
        components
      });

      // Persist per-guild message mapping
      if (typeof db.addReportMessageMapping === 'function') {
        await db.addReportMessageMapping({
          report_id: report.id,
          guild_id: guildId,
          channel_id: channel.id,
          message_id: message.id
        });
      }

      console.log('[DISPATCH] Posted report', report.id, '→', guildId);
    } catch (err) {
      console.error('[DISPATCH] Failed for guild', guildId, err);
    }
  }
}

module.exports = {
  dispatchReport
};
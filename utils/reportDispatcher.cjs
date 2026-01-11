/**
 * utils/reportDispatcher.cjs
 *
 * Responsible for POSTING reports to Discord.
 * This is the ONLY file that should call channel.send().
 */

async function dispatchReport({ client, report, renderCard, components = [] }) {
  if (!client) {
    console.warn('⚠ dispatchReport called without client');
    return;
  }

  if (!report || !report.rarityKey) {
    console.warn('⚠ dispatchReport called with invalid report:', report);
    return;
  }

  // ──────────────────────────────
  // ROUTING (MAIN GUILD)
  // ──────────────────────────────
  const guildId = process.env.MAIN_GUILD_ID;
  const channelId = process.env[`REPORT_CHANNEL_${report.rarityKey.toUpperCase()}`];

  if (!guildId || !channelId) {
    console.warn('⚠ No routing target for report:', report);
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn('⚠ Failed to fetch channel:', channelId);
    return;
  }

  // ──────────────────────────────
  // RENDER CARD
  // ──────────────────────────────
  const { buffer, filename } = await renderCard();

  // ──────────────────────────────
  // POST TO DISCORD
  // ──────────────────────────────
  await channel.send({
    files: [{ attachment: buffer, name: filename }],
    components
  });

  console.log(
    `📤 Report posted to #${channel.name} (${report.rarityKey})`
  );
}

/**
 * Vortex entry point (used ONLY by watcher/adapter)
 */
async function dispatchVortexRoamer(client, roamer) {
  const { handleVortexRoamer } = require('./vortexRoamerHandler.cjs');
  return handleVortexRoamer(client, roamer);
}

module.exports = {
  dispatchReport,
  dispatchVortexRoamer
};
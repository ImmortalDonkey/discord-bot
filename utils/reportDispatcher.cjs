/**
 * utils/reportDispatcher.cjs
 *
 * Responsible for POSTING reports to Discord.
 * This is the ONLY file that should call channel.send().
 *
 * Routing rules (LOCKED):
 * - MAIN guild → env-based rarity routing
 * - Subscriber guilds → DB-based single-channel routing
 */

const db = require('../database.cjs');

async function dispatchReport({
  client,
  report,
  renderCard,
  components = []
}) {
  if (!client) {
    console.warn('⚠ dispatchReport called without client');
    return;
  }

  if (!report || !report.rarityKey) {
    console.warn('⚠ dispatchReport called with invalid report:', report);
    return;
  }

  const mainGuildId = process.env.GUILD_ID;
  let channelId = null;

  // ──────────────────────────────
  // MAIN GUILD → ENV ROUTING
  // ──────────────────────────────
  if (report.guildId === mainGuildId) {
    channelId =
      process.env[`CHANNEL_${report.rarityKey.toUpperCase()}`];

    if (!channelId) {
      console.warn(
        '⚠ No routing target for MAIN report:',
        report
      );
      return;
    }
  }

  // ──────────────────────────────
  // SUBSCRIBER GUILDS → DB ROUTING
  // ──────────────────────────────
  else {
    const route = await db.getSubscriberRoute(report.guildId);

    if (!route || !route.channel_id) {
      console.warn(
        '⚠ No routing target for subscriber report:',
        report
      );
      return;
    }

    channelId = route.channel_id;
  }

  // ──────────────────────────────
  // FETCH CHANNEL
  // ──────────────────────────────
  const channel = await client.channels
    .fetch(channelId)
    .catch(() => null);

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
 * Vortex entry point
 * Used ONLY by roamerWatcher → reportDispatchAdapter
 */
async function dispatchVortexRoamer(client, roamer) {
  const { handleVortexRoamer } = require('./vortexRoamerHandler.cjs');
  return handleVortexRoamer(client, roamer);
}

module.exports = {
  dispatchReport,
  dispatchVortexRoamer
};
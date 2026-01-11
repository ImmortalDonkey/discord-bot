/**
 * utils/reportDispatcher.cjs
 *
 * Responsible for POSTING reports to Discord.
 * This is the ONLY file that should call channel.send().
 *
 * FINAL ROUTING RULES (LOCKED):
 * - MAIN guild → env-based channels + roles
 * - SUBSCRIBER guilds → DB-based channels + roles
 */

const db = require('../database.cjs');

/**
 * Normalise Pokémon names to ENV-safe keys
 * Examples:
 *  "Cyclizar"         → CYCLIZAR
 *  "Ancient Gengar"  → ANCIENT_GENGAR
 *  "Zygarde (Cell)"  → ZYGARDE_CELL
 */
function normalizePokemonKey(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_');
}

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
  let content = '';

  // ──────────────────────────────
  // MAIN GUILD → ENV ROUTING + ROLES
  // ──────────────────────────────
  if (report.guildId === mainGuildId) {
    channelId =
      process.env[`CHANNEL_${report.rarityKey.toUpperCase()}`];

    if (!channelId) {
      console.warn('⚠ No routing target for MAIN report:', report);
      return;
    }

    const mentions = [];

    // Pokémon role (ENV)
    const pokemonKey = normalizePokemonKey(report.pokemonKey);
    const pokemonRoleId =
      process.env[`ROLE_POKEMON_${pokemonKey}`];

    if (pokemonRoleId) {
      mentions.push(`<@&${pokemonRoleId}>`);
    }

    // Rarity role (ENV)
    const rarityRoleId =
      process.env[`ROLE_${report.rarityKey.toUpperCase()}`];

    if (rarityRoleId) {
      mentions.push(`<@&${rarityRoleId}>`);
    }

    content = mentions.join(' ');
  }

  // ──────────────────────────────
  // SUBSCRIBER GUILDS → DB ROUTING + ROLES
  // ──────────────────────────────
  else {
    const route = await db.getSubscriberRoute(
      report.guildId,
      report.pokemonKey,
      report.rarityKey
    );

    if (!route || !route.channel_id) {
      console.warn(
        '⚠ No routing target for subscriber report:',
        report
      );
      return;
    }

    channelId = route.channel_id;

    const mentions = [];

    if (route.pokemon_role_id) {
      mentions.push(`<@&${route.pokemon_role_id}>`);
    }

    if (route.rarity_role_id) {
      mentions.push(`<@&${route.rarity_role_id}>`);
    }

    content = mentions.join(' ');
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
  const sentMessage = await channel.send({
    content: content || undefined,
    files: [{ attachment: buffer, name: filename }],
    components
  });

  // ──────────────────────────────
  // 🔒 CRITICAL: STORE MESSAGE MAPPING
  // Enables expiry re-render + cleanup
  // ──────────────────────────────
  if (report.id && sentMessage) {
    await db.addReportMessageMapping({
      report_id: report.id,
      channel_id: channel.id,
      message_id: sentMessage.id
    });
  }

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
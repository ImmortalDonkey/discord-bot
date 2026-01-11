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

async function postToGuild({
  client,
  guildId,
  channelId,
  pokemonRoleId,
  rarityRoleId,
  report,
  renderCard,
  components
}) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn('⚠ Failed to fetch channel:', channelId);
    return;
  }

  const mentions = [];
  if (pokemonRoleId) mentions.push(`<@&${pokemonRoleId}>`);
  if (rarityRoleId) mentions.push(`<@&${rarityRoleId}>`);

  const { buffer, filename } = await renderCard();

  const msg = await channel.send({
    content: mentions.length ? mentions.join(' ') : undefined,
    files: [{ attachment: buffer, name: filename }],
    components
  });

  // 🔒 CRITICAL: persist message mapping
  await db.addReportMessageMapping({
    reportId: report.id,
    guildId,
    channelId: channel.id,
    messageId: msg.id
  });

  console.log(
    `📤 Report posted to #${channel.name} (${report.rarityKey}) [${guildId}]`
  );
}

async function dispatchReport({
  client,
  report,
  renderCard,
  components = []
}) {
  if (!client || !report?.id || !report?.rarityKey) {
    console.warn('⚠ dispatchReport called with invalid payload:', report);
    return;
  }

  const mainGuildId = process.env.GUILD_ID;

  // ──────────────────────────────
  // MAIN GUILD
  // ──────────────────────────────
  const mainChannelId =
    process.env[`CHANNEL_${report.rarityKey.toUpperCase()}`];

  if (mainChannelId) {
    const pokemonKey = normalizePokemonKey(report.pokemonKey);

    await postToGuild({
      client,
      guildId: mainGuildId,
      channelId: mainChannelId,
      pokemonRoleId: process.env[`ROLE_POKEMON_${pokemonKey}`],
      rarityRoleId: process.env[`ROLE_${report.rarityKey.toUpperCase()}`],
      report,
      renderCard,
      components
    });
  } else {
    console.warn('⚠ No routing target for MAIN report:', report);
  }

  // ──────────────────────────────
  // SUBSCRIBER GUILDS (FAN-OUT)
  // ──────────────────────────────
  const subscribers = await db.getSubscriberGuilds();

  for (const g of subscribers) {
    const pokemonRole =
      await db.getGuildPokemonRole(g.guild_id, normalizePokemonKey(report.pokemonKey));

    const rarityRole =
      await db.getGuildRarityRole(g.guild_id, report.rarityKey);

    await postToGuild({
      client,
      guildId: g.guild_id,
      channelId: g.report_channel_id,
      pokemonRoleId: pokemonRole?.role_id || null,
      rarityRoleId: rarityRole?.role_id || null,
      report,
      renderCard,
      components
    });
  }
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
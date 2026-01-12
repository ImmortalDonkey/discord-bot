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
 * Normalise Pokémon names to ENV-safe keys (MAIN GUILD ONLY)
 */
function normalizePokemonKeyEnv(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[()']/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Normalise keys to DB-safe format (SUBSCRIBER GUILDS)
 * Used for BOTH Pokémon and rarity keys
 */
function normalizeDbKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[()']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
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
  // MAIN GUILD (ENV)
  // ──────────────────────────────
  const mainChannelId =
    process.env[`CHANNEL_${report.rarityKey.toUpperCase()}`];

  if (mainChannelId) {
    const pokemonKeyEnv = normalizePokemonKeyEnv(report.pokemonKey);

    await postToGuild({
      client,
      guildId: mainGuildId,
      channelId: mainChannelId,
      pokemonRoleId: process.env[`ROLE_POKEMON_${pokemonKeyEnv}`],
      rarityRoleId: process.env[`ROLE_${report.rarityKey.toUpperCase()}`],
      report,
      renderCard,
      components
    });
  }

  // ──────────────────────────────
  // SUBSCRIBER GUILDS (DB FAN-OUT)
  // ──────────────────────────────
  const subscribers = await db.getSubscriberGuilds();

  for (const g of subscribers) {
    // ── Pokémon role lookup (raw → normalized)
    const rawPokemonKey = report.pokemonKey;
    const normalizedPokemonKey = normalizeDbKey(rawPokemonKey);

    let pokemonRole =
      await db.getGuildPokemonRole(g.guild_id, rawPokemonKey);

    if (!pokemonRole && normalizedPokemonKey !== rawPokemonKey) {
      pokemonRole =
        await db.getGuildPokemonRole(g.guild_id, normalizedPokemonKey);
    }

    // ── Rarity role lookup (raw → normalized)
    const rawRarityKey = report.rarityKey;
    const normalizedRarityKey = normalizeDbKey(rawRarityKey);

    let rarityRole =
      await db.getGuildRarityRole(g.guild_id, rawRarityKey);

    if (!rarityRole && normalizedRarityKey !== rawRarityKey) {
      rarityRole =
        await db.getGuildRarityRole(g.guild_id, normalizedRarityKey);
    }

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
 */
async function dispatchVortexRoamer(client, roamer) {
  const { handleVortexRoamer } = require('./vortexRoamerHandler.cjs');
  return handleVortexRoamer(client, roamer);
}

module.exports = {
  dispatchReport,
  dispatchVortexRoamer
};
// utils/reportChannelRouter.cjs

require('dotenv').config();
const db = require('../database.cjs');

/**
 * MAIN GUILD: rarity → channel (env)
 */
function getChannelForRarity(rarityKey) {
  const envKey = `CHANNEL_${rarityKey.toUpperCase()}`;
  return process.env[envKey] || null;
}

/**
 * MAIN GUILD: rarity → role (env)
 */
function getRoleForRarity(rarityKey) {
  const envKey = `ROLE_${rarityKey.toUpperCase()}`;
  return process.env[envKey] || null;
}

/**
 * Resolve routing for BOTH main + subscriber guilds
 *
 * Returns:
 * {
 *   channelId,
 *   rarityRoleId,
 *   pokemonRoleId,
 *   wrongChannel
 * }
 *
 * Priority:
 * 1. Subscriber guild override (DB)
 * 2. Main guild rarity routing (ENV)
 */
async function getReportRouting({
  guildId,
  rarityKey,
  pokemonKey = null,
  currentChannelId
}) {
  // ──────────────────────────────
  // SUBSCRIBER GUILD OVERRIDE (DB)
  // ──────────────────────────────
  const subscriber =
    typeof db.getSubscriberGuild === 'function'
      ? await db.getSubscriberGuild(guildId)
      : null;

  if (subscriber && subscriber.enabled && subscriber.report_channel_id) {
    const wrongChannel =
      currentChannelId &&
      currentChannelId !== subscriber.report_channel_id;

    const rarityRoleRow =
      typeof db.getGuildRarityRole === 'function'
        ? await db.getGuildRarityRole(guildId, rarityKey)
        : null;

    const pokemonRoleRow =
      pokemonKey && typeof db.getGuildPokemonRole === 'function'
        ? await db.getGuildPokemonRole(guildId, pokemonKey)
        : null;

    return {
      channelId: subscriber.report_channel_id,
      rarityRoleId: rarityRoleRow?.role_id || null,
      pokemonRoleId: pokemonRoleRow?.role_id || null,
      wrongChannel
    };
  }

  // ──────────────────────────────
  // MAIN GUILD (ENV-BASED ROUTING)
  // ──────────────────────────────
  const channelId = getChannelForRarity(rarityKey);
  const rarityRoleId = getRoleForRarity(rarityKey);

  const wrongChannel =
    channelId &&
    currentChannelId &&
    currentChannelId !== channelId;

  return {
    channelId,
    rarityRoleId,
    pokemonRoleId: null, // main guild unchanged
    wrongChannel
  };
}

module.exports = {
  getReportRouting
};

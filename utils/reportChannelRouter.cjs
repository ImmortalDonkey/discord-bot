// utils/reportChannelRouter.cjs

const db = require('../database.cjs');

/**
 * ──────────────────────────────
 * LEGACY HELPERS (MAIN GUILD)
 * ──────────────────────────────
 * These are REQUIRED by:
 * - Vortex auto report handler
 * - Any legacy utilities
 *
 * DO NOT REMOVE — migration-safe exports
 */

/**
 * MAIN GUILD: rarity → channel (env)
 * Example: CHANNEL_LEGENDARY
 */
function getChannelForRarity(rarityKey) {
  if (!rarityKey) return null;
  const envKey = `CHANNEL_${rarityKey.toUpperCase()}`;
  return process.env[envKey] || null;
}

/**
 * MAIN GUILD: rarity → role (env)
 * Example: ROLE_LEGENDARY
 */
function getRoleForRarity(rarityKey) {
  if (!rarityKey) return null;
  const envKey = `ROLE_${rarityKey.toUpperCase()}`;
  return process.env[envKey] || null;
}

/**
 * ──────────────────────────────
 * UNIFIED ROUTER (MAIN + SUBSCRIBERS)
 * ──────────────────────────────
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
 * 2. Main guild env routing
 */
async function getReportRouting({
  guildId,
  rarityKey,
  pokemonKey = null,
  currentChannelId = null
}) {
  // ──────────────────────────────
  // SUBSCRIBER GUILD (DB-BASED)
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

    console.log('[ROUTING][SUBSCRIBER]', {
      guildId,
      rarityKey,
      pokemonKey,
      channelId: subscriber.report_channel_id,
      rarityRoleId: rarityRoleRow?.role_id || null,
      pokemonRoleId: pokemonRoleRow?.role_id || null,
      wrongChannel
    });

    return {
      channelId: subscriber.report_channel_id,
      rarityRoleId: rarityRoleRow?.role_id || null,
      pokemonRoleId: pokemonRoleRow?.role_id || null,
      wrongChannel
    };
  }

  // ──────────────────────────────
  // MAIN GUILD (ENV-BASED)
  // ──────────────────────────────
  const channelId = getChannelForRarity(rarityKey);
  const rarityRoleId = getRoleForRarity(rarityKey);

  const wrongChannel =
    channelId &&
    currentChannelId &&
    currentChannelId !== channelId;

  console.log('[ROUTING][MAIN]', {
    guildId,
    rarityKey,
    channelId,
    rarityRoleId,
    pokemonRoleId: null,
    wrongChannel
  });

  return {
    channelId,
    rarityRoleId,
    pokemonRoleId: null, // main guild unchanged
    wrongChannel
  };
}

module.exports = {
  // ✅ Legacy exports (DO NOT REMOVE)
  getChannelForRarity,
  getRoleForRarity,

  // ✅ Unified router
  getReportRouting
};
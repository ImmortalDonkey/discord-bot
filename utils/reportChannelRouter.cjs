// utils/reportChannelRouter.cjs

const db = require('../database.cjs');

/**
 * Normalize Pokémon names to DB-safe keys
 * MUST match database + ENV format
 *
 * Examples:
 *  "Zygarde (Cell)"      → zygarde_cell
 *  "Ancient Gengar"     → ancient_gengar
 *  "Gimmighoul (Roaming)" → gimmighoul_roaming
 */
function normalizePokemonKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .trim();
}

/**
 * ──────────────────────────────
 * LEGACY HELPERS (MAIN GUILD)
 * ──────────────────────────────
 * REQUIRED for backward compatibility
 */

/**
 * MAIN GUILD: rarity → channel (env)
 */
function getChannelForRarity(rarityKey) {
  if (!rarityKey) return null;
  return process.env[`CHANNEL_${rarityKey.toUpperCase()}`] || null;
}

/**
 * MAIN GUILD: rarity → role (env)
 */
function getRoleForRarity(rarityKey) {
  if (!rarityKey) return null;
  return process.env[`ROLE_${rarityKey.toUpperCase()}`] || null;
}

/**
 * ──────────────────────────────
 * UNIFIED ROUTER (MAIN + SUBSCRIBERS)
 * ──────────────────────────────
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
  const subscriber = await db.getSubscriberGuild?.(guildId);

  if (subscriber && subscriber.enabled && subscriber.report_channel_id) {
    const wrongChannel =
      currentChannelId &&
      currentChannelId !== subscriber.report_channel_id;

    const rarityRoleRow =
      await db.getGuildRarityRole?.(guildId, rarityKey);

    const normalizedPokemonKey =
      pokemonKey ? normalizePokemonKey(pokemonKey) : null;

    const pokemonRoleRow =
      normalizedPokemonKey
        ? await db.getGuildPokemonRole?.(
            guildId,
            normalizedPokemonKey
          )
        : null;

    console.log('[ROUTING][SUBSCRIBER]', {
      guildId,
      rarityKey,
      pokemonKey: normalizedPokemonKey,
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
  // Legacy exports (DO NOT REMOVE)
  getChannelForRarity,
  getRoleForRarity,

  // Unified router
  getReportRouting
};
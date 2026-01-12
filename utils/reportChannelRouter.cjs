const db = require('../database.cjs');

/**
 * Normalize Pokémon names to canonical keys
 * MUST match:
 * - ENV role keys
 * - DB guild_pokemon_roles.pokemon_key
 *
 * Examples:
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

/**
 * ──────────────────────────────
 * LEGACY HELPERS (MAIN GUILD)
 * ──────────────────────────────
 * DO NOT REMOVE
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

    const normalizedPokemonKey =
      pokemonKey ? normalizePokemonKey(pokemonKey) : null;

    const pokemonRoleRow =
      normalizedPokemonKey &&
      typeof db.getGuildPokemonRole === 'function'
        ? await db.getGuildPokemonRole(guildId, normalizedPokemonKey)
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
    pokemonRoleId: null,
    wrongChannel
  };
}

module.exports = {
  // ✅ Legacy exports
  getChannelForRarity,
  getRoleForRarity,

  // ✅ Unified router
  getReportRouting
};
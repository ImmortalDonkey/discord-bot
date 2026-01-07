// utils/reportChannelRouter.cjs

/**
 * Handles routing a report to the correct channel,
 * with support for:
 * - main guild (rarity-based routing)
 * - subscriber guilds (single unified channel)
 *
 * This file centralises:
 * - rarity → channel mapping
 * - rarity → role mapping
 * - subscriber override logic
 * - wrong-channel detection helper
 */

require('dotenv').config();
const db = require('../database.cjs');

/**
 * Return environment-configured Discord channel ID for given rarity key.
 * (MAIN GUILD ONLY)
 */
function getChannelForRarity(rarityKey) {
  const envKey = `CHANNEL_${rarityKey.toUpperCase()}`;
  return process.env[envKey] || null;
}

/**
 * Return environment-configured role ID for given rarity key.
 * (MAIN GUILD ONLY)
 */
function getRoleForRarity(rarityKey) {
  const envKey = `ROLE_${rarityKey.toUpperCase()}`;
  return process.env[envKey] || null;
}

/**
 * Resolve routing for a report, guild-aware.
 *
 * Returns:
 * {
 *   channelId,
 *   roleId,
 *   wrongChannel
 * }
 */
async function getReportRouting({
  guildId,
  rarityKey,
  currentChannelId
}) {
  // ──────────────────────────────
  // SUBSCRIBER GUILD OVERRIDE
  // ──────────────────────────────
  const subscriber = await db.getSubscriberGuild?.(guildId);

  if (subscriber?.enabled && subscriber.report_channel_id) {
    return {
      channelId: subscriber.report_channel_id,
      roleId: null,          // no rarity pings for subscribers
      wrongChannel: false    // only one valid channel
    };
  }

  // ──────────────────────────────
  // MAIN GUILD (RARITY ROUTING)
  // ──────────────────────────────
  const channelId = getChannelForRarity(rarityKey);
  const roleId = getRoleForRarity(rarityKey);

  const wrongChannel =
    channelId && currentChannelId && currentChannelId !== channelId;

  return {
    channelId,
    roleId,
    wrongChannel
  };
}

module.exports = {
  getChannelForRarity,
  getRoleForRarity,
  getReportRouting
};

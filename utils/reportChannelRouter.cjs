// utils/reportChannelRouter.cjs

/**
 * Handles routing a report to the correct rarity channel,
 * and selecting the correct role ping.
 *
 * This file centralises:
 * - rarity → channel mapping
 * - rarity → role mapping
 * - wrong-channel detection helper
 */

require('dotenv').config();

/**
 * Return environment-configured Discord channel ID for given rarity key.
 */
function getChannelForRarity(rarityKey) {
  const envKey = `CHANNEL_${rarityKey.toUpperCase()}`;
  return process.env[envKey] || null;
}

/**
 * Return environment-configured role ID for given rarity key.
 */
function getRoleForRarity(rarityKey) {
  const envKey = `ROLE_${rarityKey.toUpperCase()}`;
  return process.env[envKey] || null;
}

/**
 * Given a rarity key and the current interaction channel,
 * determine whether the report is in the correct place.
 *
 * Returns:
 * {
 *   correctChannelId,
 *   roleId,
 *   wrongChannel: true/false
 * }
 */
function getReportRouting(rarityKey, currentChannelId) {
  const correctChannelId = getChannelForRarity(rarityKey);
  const roleId = getRoleForRarity(rarityKey);

  const wrongChannel =
    correctChannelId && currentChannelId !== correctChannelId;

  return {
    correctChannelId,
    roleId,
    wrongChannel
  };
}

module.exports = {
  getChannelForRarity,
  getRoleForRarity,
  getReportRouting
};

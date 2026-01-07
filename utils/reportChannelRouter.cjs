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
    const wrongChannel =
      currentChannelId &&
      currentChannelId !== subscriber.report_channel_id;

    return {
      channelId: subscriber.report_channel_id,
      roleId: subscriber.role_id || null,
      wrongChannel
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
  getReportRouting
};

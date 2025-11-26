// utils/channelResolver.cjs

const { ChannelType } = require('discord.js');

/**
 * Resolve the correct claims forum channel.
 * Priority:
 * 1) CLAIMS_FORUM_CHANNEL_ID or CLAIMS_CHANNEL_ID
 * 2) Forum channel named "claims"
 */
async function getClaimsForumChannel(guild) {
  const envId =
    process.env.CLAIMS_FORUM_CHANNEL_ID ||
    process.env.CLAIMS_CHANNEL_ID;

  if (envId) {
    const ch = await guild.channels.fetch(envId).catch(() => null);
    if (ch && ch.type === ChannelType.GuildForum) return ch;
  }

  // fallback: find by name
  const found = guild.channels.cache.find(
    c => c.type === ChannelType.GuildForum && c.name.toLowerCase() === 'claims'
  );
  return found || null;
}

/**
 * Get the bounty-request channel
 */
async function getBountyRequestChannel(guild) {
  const id = process.env.BOUNTY_REQUEST_CHANNEL_ID;
  if (!id) return null;

  return await guild.channels.fetch(id).catch(() => null);
}

/**
 * Get the bounty-announcement channel
 */
async function getBountyAnnouncementChannel(guild) {
  const id = process.env.BOUNTY_CHANNEL_ID;
  if (!id) return null;

  return await guild.channels.fetch(id).catch(() => null);
}

/**
 * Get the correct rarity report channel
 * (e.g. CHANNEL_PARADOX, CHANNEL_RARE, etc)
 */
async function getReportChannel(guild, rarityKey) {
  const envKey = `CHANNEL_${rarityKey.toUpperCase()}`;
  const id = process.env[envKey];

  if (!id) return null;

  return await guild.channels.fetch(id).catch(() => null);
}

/**
 * Get the ping role for a rarity
 * (e.g. ROLE_PARADOX, ROLE_LEGENDARY)
 */
function getPingRoleId(rarityKey) {
  const envKey = `ROLE_${rarityKey.toUpperCase()}`;
  return process.env[envKey] || null;
}

module.exports = {
  getClaimsForumChannel,
  getBountyRequestChannel,
  getBountyAnnouncementChannel,
  getReportChannel,
  getPingRoleId
};

// utils/bountyScheduler.cjs
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const db = require('../database.cjs');
const { getRankName } = require('./rankSystem.cjs');
const { createBountyCard } = require('../renderers/cardRenderer.cjs');
const {
  getHighestRarityForList,
  getRarityDisplayLabel,
} = require('./rarity.cjs');

// Helper to build + send the bounty card and claim button
async function postBountyCard(client, bountyId) {
  const bounty = client.activeBounties.get(bountyId);
  if (!bounty) return null;

  const guildId = process.env.GUILD_ID;
  const channelId = process.env.BOUNTY_CHANNEL_ID;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.error('❌ Bounty scheduler: guild not found.');
    return null;
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    console.error('❌ Bounty scheduler: bounty channel not found.');
    return null;
  }

  // Member → name + avatar
  const member = await guild.members.fetch(bounty.requesterId).catch(() => null);
  const username =
    member?.nickname ||
    member?.user?.username ||
    bounty.requesterName ||
    'Trainer';

  const avatarUrl =
    member?.displayAvatarURL({ extension: 'png', size: 512 }) ||
    member?.user?.displayAvatarURL({ extension: 'png', size: 512 }) ||
    guild.iconURL({ extension: 'png', size: 512 }) ||
    null;

  // Rank from DB
  let rankName = 'Rookie Trainer';
  try {
    const dbUser = await db.getUserById(bounty.requesterId);
    const lifetime = dbUser?.lifetime_points ?? dbUser?.points ?? 0;
    rankName = getRankName(lifetime);
  } catch (err) {
    console.warn('⚠ Could not load rank for bounty card:', err.message);
  }

  const rarityKey = getHighestRarityForList(bounty.pokemons);
  const rarityLabel = getRarityDisplayLabel(rarityKey);
  const rewardLabel = `${Number(bounty.reward || 0).toLocaleString()} PKD`;

  const startDate = new Date(bounty.startTime);
  const endDate = new Date(bounty.endTime);

  const startLabel = bounty.startsNow
    ? 'Starts Immediately'
    : startDate.toLocaleString('en-GB'); // server timezone
  const endLabel = endDate.toLocaleString('en-GB');
  const durationLabel = `${bounty.durationHours} hour(s)`;

  const cardPath = await createBountyCard({
    bountyId,
    username,
    rankName,
    rarityKey,
    rarityLabel,
    pokemons: bounty.pokemons,
    startLabel,
    endLabel,
    durationLabel,
    note: bounty.notes || 'Good luck!',
    rewardLabel,
    avatarUrl,
  });

  // Role pings: global + rarity-specific
  const rarityEnv = `ROLE_${rarityKey.toUpperCase()}`;
  const rarityRoleId = process.env[rarityEnv];
  const bountyAllRoleId = process.env.ROLE_BOUNTY_ALL;

  let pingText = '';
  if (bountyAllRoleId) pingText += `<@&${bountyAllRoleId}> `;
  if (rarityRoleId) pingText += `<@&${rarityRoleId}>`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claimbounty_${bountyId}`)
      .setLabel('Claim Bounty')
      .setStyle(ButtonStyle.Success),
  );

  const msg = await channel.send({
    content: pingText.trim(),
    files: [{ attachment: cardPath, name: path.basename(cardPath) }],
    components: [row],
  });

  bounty.channelId = channel.id;
  bounty.messageId = msg.id;
  bounty.hasStarted = true;
  client.activeBounties.set(bountyId, bounty);

  return msg;
}

// Periodically checks for scheduled bounties that need to start
function startBountyScheduler(client) {
  const INTERVAL = 60 * 1000; // 1 minute

  setInterval(async () => {
    const now = Date.now();

    for (const [bountyId, bounty] of client.activeBounties) {
      const startMs = Number(bounty.startTime || 0);
      const endMs = Number(bounty.endTime || 0);

      // Start scheduled bounties
      if (!bounty.hasStarted && startMs && now >= startMs) {
        try {
          // Delete announcement if it exists
          const guildId = process.env.GUILD_ID;
          const channelId = process.env.BOUNTY_CHANNEL_ID;
          const guild = client.guilds.cache.get(guildId);
          const channel = guild?.channels.cache.get(channelId);

          if (channel && bounty.announcementId) {
            const msg = await channel.messages
              .fetch(bounty.announcementId)
              .catch(() => null);
            if (msg) await msg.delete().catch(() => {});
          }

          await postBountyCard(client, bountyId);
        } catch (err) {
          console.error('❌ Error starting scheduled bounty:', err);
        }
      }

      // Optional: when time is over, remove claim button
      if (bounty.hasStarted && endMs && now >= endMs && !bounty.completed) {
        try {
          const guildId = process.env.GUILD_ID;
          const channelId = process.env.BOUNTY_CHANNEL_ID;
          const guild = client.guilds.cache.get(guildId);
          const channel = guild?.channels.cache.get(channelId);

          if (channel && bounty.messageId) {
            const msg = await channel.messages
              .fetch(bounty.messageId)
              .catch(() => null);
            if (msg) {
              await msg.edit({ components: [] }).catch(() => {});
            }
          }

          bounty.completed = true;
          client.activeBounties.set(bountyId, bounty);
        } catch (err) {
          console.error('❌ Error expiring bounty:', err);
        }
      }
    }
  }, INTERVAL);
}

module.exports = {
  startBountyScheduler,
  postBountyCard,
};
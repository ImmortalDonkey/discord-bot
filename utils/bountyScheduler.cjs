// utils/bountyScheduler.cjs
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const db = require('../database.cjs');
const { getRankName } = require('./rankSystem.cjs');
const { createBountyCard } = require('../renderers/cardRenderer.cjs');
const { getHighestRarityForList, getRarityDisplayLabel } = require('./rarity.cjs');

/**
 * Build + send the bounty card and claim button for a given bounty object.
 * Also updates the bounty with cardChannelId and cardMessageId.
 */
async function postBountyCard(client, bounty) {
  const guildId = bounty.guildId || process.env.GUILD_ID;
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

  const pokemons = bounty.pokemons || [];

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

  // Rank from DB (points are still in SQLite)
  let rankName = 'Rookie Trainer';
  try {
    const dbUser = await db.getUserById(bounty.requesterId);
    const lifetime = dbUser?.lifetime_points ?? dbUser?.points ?? 0;
    rankName = getRankName(lifetime);
  } catch (err) {
    console.warn('⚠ Could not load rank for bounty card:', err.message);
  }

  const rarityKey = bounty.rarityKey || getHighestRarityForList(pokemons);
  const rarityLabel = bounty.rarityLabel || getRarityDisplayLabel(rarityKey);
  const rewardLabel = `${Number(bounty.reward || 0).toLocaleString()} PKD`;

  const startDate = new Date(bounty.startTime);
  const endDate = new Date(bounty.endTime);

  const startLabel = startDate.toLocaleString('en-GB');
  const endLabel = endDate.toLocaleString('en-GB');
  const durationLabel = `${bounty.durationHours} hour(s)`;

  const cardBuffer = await createBountyCard({
    bountyId: bounty.id,
    username,
    rankName,
    rarityKey,
    rarityLabel,
    pokemons,
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
      .setCustomId(`claimbounty_${bounty.id}`)
      .setLabel('Claim Bounty')
      .setStyle(ButtonStyle.Success),
  );

  const msg = await channel.send({
    content: pingText.trim(),
    files: [{
      attachment: cardBuffer,
      name: `bounty_${bounty.id}.png`
    }],
    components: [row],
  });

  await db.updateBounty(bounty.id, {
    cardChannelId: channel.id,
    cardMessageId: msg.id
  });

  return msg;
}

/**
 * Periodically checks for bounties that need to start or expire.
 */
function startBountyScheduler(client) {
  const INTERVAL = 60 * 1000; // 1 minute

  setInterval(async () => {
    const now = Date.now();

    try {
      // Bounties that need to start (no card yet, startTime <= now)
      const toStart = await db.getBountiesToStart(now);

      for (const bounty of toStart) {
        try {
          // Delete scheduled announcement if it exists
          if (bounty.announcementChannelId && bounty.announcementMessageId) {
            const guildId = bounty.guildId || process.env.GUILD_ID;
            const guild = client.guilds.cache.get(guildId);
            const channel = guild?.channels.cache.get(bounty.announcementChannelId);
            if (channel) {
              const msg = await channel.messages
                .fetch(bounty.announcementMessageId)
                .catch(() => null);
              if (msg) await msg.delete().catch(() => {});
            }
          }

          await postBountyCard(client, bounty);
        } catch (err) {
          console.error('❌ Error starting scheduled bounty:', err);
        }
      }

      // Bounties that need to expire (card exists, endTime <= now)
      const toExpire = await db.getBountiesToExpire(now);

      for (const bounty of toExpire) {
        try {
          const guildId = bounty.guildId || process.env.GUILD_ID;
          const guild = client.guilds.cache.get(guildId);
          const channel = guild?.channels.cache.get(bounty.cardChannelId);

          if (channel && bounty.cardMessageId) {
            const msg = await channel.messages
              .fetch(bounty.cardMessageId)
              .catch(() => null);
            if (msg) {
              await msg.edit({ components: [] }).catch(() => {});
            }
          }

          await db.updateBounty(bounty.id, { status: 'expired' });
        } catch (err) {
          console.error('❌ Error expiring bounty:', err);
        }
      }
    } catch (err) {
      console.error('❌ Bounty scheduler tick failed:', err);
    }
  }, INTERVAL);
}

module.exports = {
  startBountyScheduler,
  postBountyCard,
};

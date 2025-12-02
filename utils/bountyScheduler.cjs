// utils/bountyScheduler.cjs
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const db = require('../database.cjs');
const { getRankName } = require('./rankSystem.cjs');
const { createBountyCard } = require('../renderers/cardRenderer.cjs');

// These will be used once you send the file:
let createBountySuccessCard = null;
let createBountyFailedCard = null;

try {
  createBountySuccessCard = require('../renderers/bountyCardEndSuccess.cjs').createBountySuccessCard;
  createBountyFailedCard = require('../renderers/bountyCardEndFailed.cjs').createBountyFailedCard;
} catch {}

// rarity helpers
const { getHighestRarityForList, getRarityDisplayLabel } = require('./rarity.cjs');

/**
 * Build & send the LIVE bounty card.
 * Saves cardChannelId and cardMessageId into DB + memory.
 */
async function postBountyCard(client, bounty) {
  const guildId = bounty.guildId || process.env.GUILD_ID;
  const channelId = process.env.BOUNTY_CHANNEL_ID;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.error('❌ postBountyCard: guild not found.');
    return null;
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    console.error('❌ postBountyCard: BOUNTY_CHANNEL_ID not found.');
    return null;
  }

  const pokemons = bounty.pokemons || [];

  // Member identity
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

  // Rank (points are still in SQLite)
  let rankName = 'Rookie Trainer';
  try {
    const dbUser = await db.getUserById(bounty.requesterId);
    const lifetime = dbUser?.lifetime_points ?? dbUser?.points ?? 0;
    rankName = getRankName(lifetime);
  } catch (err) {
    console.warn('⚠ Rank lookup failed:', err.message);
  }

  const rarityKey = bounty.rarityKey || getHighestRarityForList(pokemons);
  const rarityLabel = bounty.rarityLabel || getRarityDisplayLabel(rarityKey);
  const rewardLabel = `${Number(bounty.reward).toLocaleString()} PKD`;

  // Times
  const startLabel =
    bounty.startsImmediately === 1 || bounty.startsImmediately === true
      ? 'Starts Immediately'
      : new Date(bounty.startTime).toLocaleString('en-GB');

  const endLabel = new Date(bounty.endTime).toLocaleString('en-GB');
  const durationLabel = `${bounty.durationHours} hour(s)`;

  // Generate card image
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
    avatarUrl
  });

  // Buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claimbounty_${bounty.id}`)
      .setLabel('Claim Bounty')
      .setStyle(ButtonStyle.Success)
  );

  // SEND (⚠ no pings)
  const msg = await channel.send({
    files: [
      {
        attachment: cardBuffer,
        name: `bounty_${bounty.id}.png`
      }
    ],
    components: [row]
  });

  await db.updateBounty(bounty.id, {
    cardChannelId: channel.id,
    cardMessageId: msg.id
  });

  return msg;
}

/**
 * Post a "success" final card after claim approval.
 */
async function postCompletedCard(client, bounty, winnerId) {
  if (!createBountySuccessCard) return;

  const guild = client.guilds.cache.get(bounty.guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(process.env.BOUNTY_CHANNEL_ID);
  if (!channel) return;

  const buffer = await createBountySuccessCard({
    bountyId: bounty.id,
    username: `<@${winnerId}>`,
    rankName: bounty.rankName || 'Trainer',
    pokemons: bounty.pokemons,
    reward: bounty.reward
  });

  await channel.send({
    files: [{ attachment: buffer, name: `bounty_completed_${bounty.id}.png` }]
  });
}

/**
 * Post a "failed/expired" final card.
 */
async function postFailedCard(client, bounty) {
  if (!createBountyFailedCard) return;

  const guild = client.guilds.cache.get(bounty.guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(process.env.BOUNTY_CHANNEL_ID);
  if (!channel) return;

  const buffer = await createBountyFailedCard({
    bountyId: bounty.id,
    username: `<@${bounty.requesterId}>`,
    pokemons: bounty.pokemons,
    reward: bounty.reward
  });

  await channel.send({
    files: [{ attachment: buffer, name: `bounty_failed_${bounty.id}.png` }]
  });
}

/**
 * Scheduler tick – runs every minute.
 * Starts scheduled bounties and expires finished ones.
 */
function startBountyScheduler(client) {
  const INTERVAL = 60 * 1000;

  setInterval(async () => {
    const now = Date.now();

    try {
      // --------------------------------------
      // Bounties that should START
      // --------------------------------------
      const toStart = await db.getBountiesToStart(now);

      for (const bounty of toStart) {
        try {
          // Delete announcement embed if it exists
          if (bounty.announcementChannelId && bounty.announcementMessageId) {
            const guild = client.guilds.cache.get(bounty.guildId);
            const ch = guild?.channels.cache.get(bounty.announcementChannelId);
            if (ch) {
              const m = await ch.messages.fetch(bounty.announcementMessageId).catch(() => null);
              if (m) await m.delete().catch(() => {});
            }
          }

          await postBountyCard(client, bounty);

          await db.updateBounty(bounty.id, { status: 'open' });
        } catch (err) {
          console.error('❌ Error starting bounty:', err);
        }
      }

      // --------------------------------------
      // Bounties that should EXPIRE
      // --------------------------------------
      const toExpire = await db.getBountiesToExpire(now);

      for (const bounty of toExpire) {
        try {
          const guild = client.guilds.cache.get(bounty.guildId);
          const ch = guild?.channels.cache.get(bounty.cardChannelId);

          // Remove claim button
          if (ch && bounty.cardMessageId) {
            const m = await ch.messages.fetch(bounty.cardMessageId).catch(() => null);
            if (m) await m.edit({ components: [] }).catch(() => {});
          }

          // Update DB
          await db.updateBounty(bounty.id, { status: 'expired' });

          // Post failed card
          await postFailedCard(client, bounty);
        } catch (err) {
          console.error('❌ Error expiring bounty:', err);
        }
      }
    } catch (err) {
      console.error('❌ Scheduler tick failed:', err);
    }
  }, INTERVAL);
}

module.exports = {
  startBountyScheduler,
  postBountyCard,
  postCompletedCard,
  postFailedCard
};
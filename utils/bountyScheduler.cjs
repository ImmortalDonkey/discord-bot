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

// Optional final-card modules (loaded only if they exist)
let createBountySuccessCard = null;
let createBountyFailedCard = null;

try {
  createBountySuccessCard = require('../renderers/bountyCardEndSuccess.cjs').createBountySuccessCard;
  createBountyFailedCard = require('../renderers/bountyCardEndFailed.cjs').createBountyFailedCard;
} catch {}

/**
 * Build & send the LIVE bounty card.
 * Saves cardChannelId + cardMessageId into SQLite.
 */
async function postBountyCard(client, bounty) {
  const guild = client.guilds.cache.get(bounty.guildId);
  if (!guild) {
    console.error("❌ postBountyCard: Guild not found:", bounty.guildId);
    return null;
  }

  const channel = guild.channels.cache.get(process.env.BOUNTY_CHANNEL_ID);
  if (!channel) {
    console.error('❌ postBountyCard: BOUNTY_CHANNEL_ID not found.');
    return null;
  }

  const pokemons = bounty.pokemons || [];

  // Member info
  const member = await guild.members.fetch(bounty.requesterId).catch(() => null);
  const username =
    member?.nickname ||
    member?.user?.username ||
    bounty.requesterName ||
    'Trainer';

  const avatarUrl =
    member?.displayAvatarURL({ extension: 'png', size: 512 }) ||
    guild.iconURL({ extension: 'png', size: 512 });

  // Rank from SQLite
  let rankName = "Rookie Trainer";
  try {
    const u = await db.getUserById(bounty.requesterId);
    const lifetime = u?.lifetime_points ?? u?.points ?? 0;
    rankName = getRankName(lifetime);
  } catch {}

  const rarityKey = bounty.rarity_key || getHighestRarityForList(pokemons);
  const rarityLabel = bounty.rarity_label || getRarityDisplayLabel(rarityKey);
  const rewardLabel = `${Number(bounty.reward).toLocaleString()} PKD`;

  // Time labels
  const startLabel =
    bounty.starts_immediately === 1
      ? "Starts Immediately"
      : new Date(bounty.start_time).toLocaleString("en-GB");

  const endLabel = new Date(bounty.end_time).toLocaleString("en-GB");
  const durationLabel = `${bounty.duration_hours} hour(s)`;

  // Generate image buffer
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
    note: bounty.notes || "Good luck!",
    rewardLabel,
    avatarUrl
  });

  // Buttons (no pings)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claimbounty_${bounty.id}`)
      .setLabel("Claim Bounty")
      .setStyle(ButtonStyle.Success)
  );

  const msg = await channel.send({
    files: [{ attachment: cardBuffer, name: `bounty_${bounty.id}.png` }],
    components: [row]
  });

  // Save into SQLite
  await db.updateBounty(bounty.id, {
    card_channel_id: channel.id,
    card_message_id: msg.id
  });

  return msg;
}

/**
 * Post COMPLETED bounty card (no content, no ping).
 */
async function postCompletedCard(client, bounty, winnerId) {
  if (!createBountySuccessCard) return;

  const guild = client.guilds.cache.get(bounty.guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(process.env.BOUNTY_CHANNEL_ID);
  if (!channel) return;

  // Generate final card
  const buffer = await createBountySuccessCard({
    bountyId: bounty.id,
    username: `<@${winnerId}>`,
    rankName: bounty.rank_name || "Trainer",
    pokemons: bounty.pokemons,
    reward: bounty.reward
  });

  await channel.send({
    files: [{ attachment: buffer, name: `bounty_completed_${bounty.id}.png` }]
  });
}

/**
 * Post FAILED/EXPIRED bounty card (no pings).
 */
async function postFailedCard(client, bounty) {
  if (!createBountyFailedCard) return;

  const guild = client.guilds.cache.get(bounty.guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(process.env.BOUNTY_CHANNEL_ID);
  if (!channel) return;

  const buffer = await createBountyFailedCard({
    bountyId: bounty.id,
    username: `<@${bounty.requester_id}>`,
    pokemons: bounty.pokemons,
    reward: bounty.reward
  });

  await channel.send({
    files: [{ attachment: buffer, name: `bounty_failed_${bounty.id}.png` }]
  });
}

/**
 * Scheduler – runs every minute.
 * Starts scheduled bounties; expires finished ones.
 */
function startBountyScheduler(client) {
  const INTERVAL = 60000;

  setInterval(async () => {
    const now = Date.now();

    try {
      // -----------------------------------------
      // START BOUNTIES (start_time <= now)
      // -----------------------------------------
      const toStart = await db.getBountiesToStart(now);

      for (const bounty of toStart) {
        try {
          // delete future announcement
          if (bounty.announcement_channel_id && bounty.announcement_message_id) {
            const guild = client.guilds.cache.get(bounty.guildId);
            const ch = guild?.channels.cache.get(bounty.announcement_channel_id);

            if (ch) {
              const msg = await ch.messages
                .fetch(bounty.announcement_message_id)
                .catch(() => null);

              if (msg) await msg.delete().catch(() => {});
            }
          }

          // post live card immediately
          await postBountyCard(client, bounty);

          // mark as open
          await db.updateBounty(bounty.id, { status: "open" });
        } catch (err) {
          console.error("❌ Error starting bounty:", err);
        }
      }

      // -----------------------------------------
      // EXPIRE BOUNTIES (end_time <= now)
      // -----------------------------------------
      const toExpire = await db.getBountiesToExpire(now);

      for (const bounty of toExpire) {
        try {
          const guild = client.guilds.cache.get(bounty.guildId);

          // remove claim button from live card
          if (bounty.card_message_id) {
            const ch = guild.channels.cache.get(bounty.card_channel_id);
            if (ch) {
              const msg = await ch.messages.fetch(bounty.card_message_id).catch(() => null);
              if (msg) await msg.edit({ components: [] }).catch(() => {});
            }
          }

          // update database
          await db.updateBounty(bounty.id, { status: "expired" });

          // post failed card
          await postFailedCard(client, bounty);
        } catch (err) {
          console.error("❌ Error expiring bounty:", err);
        }
      }
    } catch (err) {
      console.error("❌ Scheduler tick failed:", err);
    }
  }, INTERVAL);
}

module.exports = {
  startBountyScheduler,
  postBountyCard,
  postCompletedCard,
  postFailedCard
};
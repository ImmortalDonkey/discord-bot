// utils/bountyScheduler.cjs
const path = require('path');
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
 * Build + send the bounty card and claim button for a given bounty row.
 * Also updates the DB with card_channel_id and card_message_id.
 */
async function postBountyCard(client, bountyRow) {
  const guildId = bountyRow.guild_id || process.env.GUILD_ID;
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

  const pokemons = JSON.parse(bountyRow.pokemons || '[]');

  // Member → name + avatar
  const member = await guild.members.fetch(bountyRow.requester_id).catch(() => null);
  const username =
    member?.nickname ||
    member?.user?.username ||
    bountyRow.requester_name ||
    'Trainer';

  const avatarUrl =
    member?.displayAvatarURL({ extension: 'png', size: 512 }) ||
    member?.user?.displayAvatarURL({ extension: 'png', size: 512 }) ||
    guild.iconURL({ extension: 'png', size: 512 }) ||
    null;

  // Rank from DB
  let rankName = 'Rookie Trainer';
  try {
    const dbUser = await db.getUserById(bountyRow.requester_id);
    const lifetime = dbUser?.lifetime_points ?? dbUser?.points ?? 0;
    rankName = getRankName(lifetime);
  } catch (err) {
    console.warn('⚠ Could not load rank for bounty card:', err.message);
  }

  const rarityKey = bountyRow.rarity_key || getHighestRarityForList(pokemons);
  const rarityLabel = bountyRow.rarity_label || getRarityDisplayLabel(rarityKey);
  const rewardLabel = `${Number(bountyRow.reward || 0).toLocaleString()} PKD`;

  const startDate = new Date(bountyRow.start_time);
  const endDate = new Date(bountyRow.end_time);

  const startLabel = startDate.toLocaleString('en-GB');
  const endLabel = endDate.toLocaleString('en-GB');
  const durationLabel = `${bountyRow.duration_hours} hour(s)`;

  const cardPath = await createBountyCard({
    bountyId: bountyRow.id,
    username,
    rankName,
    rarityKey,
    rarityLabel,
    pokemons,
    startLabel,
    endLabel,
    durationLabel,
    note: bountyRow.notes || 'Good luck!',
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
      .setCustomId(`claimbounty_${bountyRow.id}`)
      .setLabel('Claim Bounty')
      .setStyle(ButtonStyle.Success),
  );

  const msg = await channel.send({
    content: pingText.trim(),
    files: [{ attachment: cardPath, name: path.basename(cardPath) }],
    components: [row],
  });

  await db.updateBounty(bountyRow.id, {
    card_channel_id: channel.id,
    card_message_id: msg.id
  });

  return msg;
}

/**
 * Periodically checks DB for bounties that need to start or expire.
 */
function startBountyScheduler(client) {
  const INTERVAL = 60 * 1000; // 1 minute

  setInterval(async () => {
    const now = Date.now();

    try {
      // Bounties that need to start (no card yet, start_time <= now)
      const toStart = await db.getBountiesToStart(now);

      for (const bounty of toStart) {
        try {
          // Delete announcement if it exists
          if (bounty.announcement_channel_id && bounty.announcement_message_id) {
            const guildId = bounty.guild_id || process.env.GUILD_ID;
            const guild = client.guilds.cache.get(guildId);
            const channel = guild?.channels.cache.get(bounty.announcement_channel_id);
            if (channel) {
              const msg = await channel.messages
                .fetch(bounty.announcement_message_id)
                .catch(() => null);
              if (msg) await msg.delete().catch(() => {});
            }
          }

          await postBountyCard(client, bounty);
        } catch (err) {
          console.error('❌ Error starting scheduled bounty:', err);
        }
      }

      // Bounties that need to expire (card exists, end_time <= now)
      const toExpire = await db.getBountiesToExpire(now);

      for (const bounty of toExpire) {
        try {
          const guildId = bounty.guild_id || process.env.GUILD_ID;
          const guild = client.guilds.cache.get(guildId);
          const channel = guild?.channels.cache.get(bounty.card_channel_id);

          if (channel && bounty.card_message_id) {
            const msg = await channel.messages
              .fetch(bounty.card_message_id)
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

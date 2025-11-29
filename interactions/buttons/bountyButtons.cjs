// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { createBountyCard } = require('../../renderers/cardRenderer.cjs');
const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');
const {
  getHighestRarityForList,
  getRarityDisplayLabel
} = require('../../utils/rarity.cjs');

module.exports = {
  ids: ['approvebounty_', 'denybounty_', 'claimbounty_'],

  async execute(client, interaction) {
    const id = interaction.customId;

    // --------------------------------------------------------------------
    // 1. APPROVE BOUNTY
    // --------------------------------------------------------------------
    if (id.startsWith('approvebounty_')) {
      const bountyId = id.replace('approvebounty_', '');
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: '❌ Could not find that bounty. It may already be processed.',
          flags: 64
        });
      }

      // Move from pending → approved / active bucket
      client.pendingBounties.delete(bountyId);
      bounty.approved = true;
      client.activeBounties.set(bountyId, bounty);

      const now = Date.now();
      const startTime = bounty.startTime.getTime();

      // If "Start Now" or start time already passed → activate immediately
      if (bounty.startsNow || startTime <= now) {
        await activateBounty(interaction, client, bounty);
        return;
      }

      // Otherwise: scheduled bounty → post announcement and schedule activation
      const { rarityKey, rarityLabel } = getRarityInfo(bounty);
      const announceMsg = await postScheduledAnnouncement(
        interaction,
        bounty,
        rarityKey,
        rarityLabel
      );

      bounty.announcementMessageId = announceMsg.id;
      bounty.announcementChannelId = announceMsg.channel.id;
      client.activeBounties.set(bounty.id, bounty);

      const delay = startTime - now;

      await interaction.reply({
        content:
          `📅 **Bounty approved.** A scheduled announcement has been posted.\n` +
          `This bounty will start automatically at <t:${Math.floor(
            startTime / 1000
          )}:F>.`
      });

      setTimeout(async () => {
        await activateBounty(interaction, client, bounty);
      }, delay);

      return;
    }

    // --------------------------------------------------------------------
    // 2. DENY BOUNTY
    // --------------------------------------------------------------------
    if (id.startsWith('denybounty_')) {
      const bountyId = id.replace('denybounty_', '');
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: '❌ Could not find that bounty.',
          flags: 64
        });
      }

      client.pendingBounties.delete(bountyId);

      return interaction.reply({
        content: '❌ Bounty denied.',
        flags: 64
      });
    }

    // --------------------------------------------------------------------
    // 3. CLAIM BOUNTY (still simple for now)
    // --------------------------------------------------------------------
    if (id.startsWith('claimbounty_')) {
      const bountyId = id.replace('claimbounty_', '');
      const bounty = client.activeBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: '❌ This bounty is no longer active.',
          flags: 64
        });
      }

      const userId = interaction.user.id;

      if (!client.bountyClaims.has(bountyId)) {
        client.bountyClaims.set(bountyId, new Set());
      }
      const claimSet = client.bountyClaims.get(bountyId);

      if (claimSet.has(userId)) {
        return interaction.reply({
          content: '⚠ You have already claimed this bounty.',
          flags: 64
        });
      }

      claimSet.add(userId);

      return interaction.reply({
        content: '📝 Claim submitted! Staff will verify shortly.',
        flags: 64
      });
    }
  }
};

//
// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
//

// Figure out rarity key + label from the bounty's pokemon list
function getRarityInfo(bounty) {
  const rarityKey = getHighestRarityForList(bounty.pokemons || []);
  const rarityLabel = getRarityDisplayLabel(rarityKey);
  return { rarityKey, rarityLabel };
}

// Build mention string based on rarity + ROLE_BOUNTY_ALL
function getRarityPing(rarityKey) {
  const envMap = {
    roamerMonth: 'ROLE_ROAMERMONTH',
    paradox: 'ROLE_PARADOX',
    legendary: 'ROLE_LEGENDARY',
    rare: 'ROLE_RARE',
    common: 'ROLE_COMMON'
  };

  const allRoleId = process.env.ROLE_BOUNTY_ALL;
  const rarityEnv = envMap[rarityKey];
  const rarityRoleId = rarityEnv ? process.env[rarityEnv] : null;

  const mentions = [];

  if (rarityRoleId) mentions.push(`<@&${rarityRoleId}>`);
  if (allRoleId) mentions.push(`<@&${allRoleId}>`);

  return mentions.join(' ');
}

// Post the scheduled announcement embed (before the bounty starts)
async function postScheduledAnnouncement(interaction, bounty, rarityKey, rarityLabel) {
  const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
  const channel = interaction.guild.channels.cache.get(bountyChannelId);

  if (!channel) {
    throw new Error('BOUNTY_CHANNEL_ID is not a valid channel.');
  }

  const pokemonList = bounty.pokemons.map(p => `• ${p}`).join('\n');
  const startLabel = `<t:${Math.floor(bounty.startTime.getTime() / 1000)}:F>`;
  const endLabel = `<t:${Math.floor(bounty.endTime.getTime() / 1000)}:F>`;

  const embed = new EmbedBuilder()
    .setTitle('📢 Scheduled Bounty')
    .setDescription('This bounty has been approved and is scheduled to begin soon.')
    .addFields(
      { name: 'Trainer', value: `<@${bounty.requesterId}>`, inline: true },
      { name: 'Rarity', value: rarityLabel, inline: true },
      {
        name: 'Reward',
        value: `${bounty.reward.toLocaleString()} PKD`,
        inline: false
      },
      { name: 'Pokémon Targets', value: pokemonList, inline: false },
      { name: 'Start Time', value: startLabel, inline: true },
      { name: 'Ends', value: endLabel, inline: true },
      { name: 'Duration', value: `${bounty.durationHours} hour(s)`, inline: true }
    )
    .setColor('Blue')
    .setTimestamp();

  const pingText = getRarityPing(rarityKey);

  return await channel.send({
    content: pingText || undefined,
    embeds: [embed]
  });
}

// Activate bounty: delete announcement (if any), generate card PNG, post with button
async function activateBounty(interaction, client, bounty) {
  const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
  const channel = interaction.guild.channels.cache.get(bountyChannelId);

  if (!channel) {
    console.error('BOUNTY_CHANNEL_ID is not a valid channel.');
    return;
  }

  // Delete announcement message if it exists
  if (bounty.announcementChannelId && bounty.announcementMessageId) {
    try {
      const aChannel = interaction.guild.channels.cache.get(
        bounty.announcementChannelId
      );
      if (aChannel) {
        const aMsg = await aChannel.messages.fetch(bounty.announcementMessageId);
        await aMsg.delete();
      }
    } catch (err) {
      console.warn('Could not delete scheduled bounty announcement:', err.message);
    }
  }

  const { rarityKey, rarityLabel } = getRarityInfo(bounty);

  // Fetch trainer's display name + avatar + rank
  let displayName = 'Unknown Trainer';
  let avatarUrl =
    'https://cdn.discordapp.com/embed/avatars/0.png'; // fallback default

  try {
    const member = await interaction.guild.members.fetch(bounty.requesterId);
    displayName = member.displayName || member.user.username;
    avatarUrl = member.user.displayAvatarURL({
      extension: 'png',
      size: 512
    });
  } catch {
    // ignore, keep fallbacks
  }

  let rankName = 'Rookie Trainer';
  try {
    const row = await db.getUserById(bounty.requesterId);
    const lifetime = row?.lifetime_points || 0;
    rankName = getRankName(lifetime);
  } catch {
    // if DB fails, just leave default
  }

  const startLabel = bounty.startsNow
    ? 'Starts Immediately'
    : bounty.startTime.toLocaleString('en-GB');
  const endLabel = bounty.endTime.toLocaleString('en-GB');
  const durationLabel = `${bounty.durationHours} hour(s)`;
  const rewardLabel = `${bounty.reward.toLocaleString()} PKD`;

  // Build the PNG card
  const filePath = await createBountyCard({
    bountyId: bounty.id,
    username: displayName,
    rankName,
    rarityKey,
    rarityLabel,
    pokemons: bounty.pokemons,
    startLabel,
    endLabel,
    durationLabel,
    note: bounty.notes || 'Good luck!',
    rewardLabel,
    avatarUrl
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claimbounty_${bounty.id}`)
      .setLabel('Claim Bounty')
      .setStyle(ButtonStyle.Success)
  );

  const pingText = getRarityPing(rarityKey);

  const msg = await channel.send({
    content: pingText || undefined,
    files: [filePath],
    components: [row]
  });

  // Store where the card lives (for future updates like marking "completed")
  bounty.channelId = msg.channel.id;
  bounty.messageId = msg.id;
  bounty.cardPath = filePath;
  client.activeBounties.set(bounty.id, bounty);
}
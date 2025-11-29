// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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

    if (id.startsWith('approvebounty_')) {
      return handleApproveBounty(client, interaction);
    }

    if (id.startsWith('denybounty_')) {
      return handleDenyBounty(client, interaction);
    }

    if (id.startsWith('claimbounty_')) {
      return handleClaimBounty(client, interaction);
    }
  }
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function getRarityRoleMention(rarityKey) {
  const map = {
    paradox: process.env.ROLE_BOUNTY_PARADOX,
    roamerMonth: process.env.ROLE_BOUNTY_ROAMER_MONTH,
    legendary: process.env.ROLE_BOUNTY_LEGENDARY,
    rare: process.env.ROLE_BOUNTY_LEGENDARY,
    common: process.env.ROLE_BOUNTY_COMMON
  };

  const roleId = map[rarityKey] || process.env.ROLE_BOUNTY_ALL;

  if (!roleId) return '';
  return `<@&${roleId}>`;
}

function formatTimeLabel(date) {
  if (!(date instanceof Date)) return 'Unknown';
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

// ─────────────────────────────────────────────
// APPROVE BOUNTY
// ─────────────────────────────────────────────
async function handleApproveBounty(client, interaction) {
  if (
    !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) &&
    !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply({
      content: '❌ You do not have permission to approve bounties.',
      ephemeral: true
    });
  }

  const bountyId = interaction.customId.replace('approvebounty_', '');
  if (!client.pendingBounties) client.pendingBounties = new Map();
  if (!client.activeBounties) client.activeBounties = new Map();

  const bounty = client.pendingBounties.get(bountyId);
  if (!bounty) {
    return interaction.reply({
      content: '❌ Could not find that bounty. It may already be processed.',
      ephemeral: true
    });
  }

  // Move to active
  client.pendingBounties.delete(bountyId);
  client.activeBounties.set(bountyId, bounty);

  const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
  const bountyChannel = bountyChannelId
    ? interaction.guild.channels.cache.get(bountyChannelId)
      || await interaction.guild.channels.fetch(bountyChannelId).catch(() => null)
    : null;

  if (!bountyChannel) {
    return interaction.reply({
      content: '❌ Bounty channel not configured or not found.',
      ephemeral: true
    });
  }

  const rarityKey = getHighestRarityForList(bounty.pokemons);
  const rarityLabel = getRarityDisplayLabel(rarityKey);
  const mention = getRarityRoleMention(rarityKey);

  // Get trainer nickname + avatar + rank
  let displayName = bounty.requesterName;
  let avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 512 });
  let rankName = 'Rookie Trainer';

  try {
    const member = await interaction.guild.members.fetch(bounty.requesterId);
    displayName = member.displayName || member.user.username;
    avatarUrl = member.displayAvatarURL({ extension: 'png', size: 512 });

    const row = await db.getUserById(bounty.requesterId);
    const lifetime = row?.lifetime_points || 0;
    rankName = getRankName(lifetime);
  } catch {
    // fall back to defaults
  }

  const rewardLabel = `${bounty.reward.toLocaleString()} PKD`;
  const startLabel = formatTimeLabel(bounty.startTime);
  const endLabel = formatTimeLabel(bounty.endTime);
  const durationLabel = `${bounty.durationHours} hour(s)`;

  // Announcement + scheduling logic
  if (bounty.startsNow) {
    // Start immediately: just post card + button
    const buffer = await createBountyCard({
      bountyId: bounty.id,
      username: displayName,
      rankName,
      rarityKey,
      rarityLabel,
      pokemons: bounty.pokemons,
      startLabel,
      endLabel,
      durationLabel,
      note: bounty.notes,
      rewardLabel,
      avatarUrl
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claimbounty_${bounty.id}`)
        .setLabel('Claim Bounty')
        .setStyle(ButtonStyle.Success)
    );

    const msg = await bountyChannel.send({
      content: mention || '',
      files: [{ attachment: buffer, name: 'bounty-card.png' }],
      components: [row]
    });

    // Track message info
    bounty.messageId = msg.id;
    bounty.channelId = msg.channel.id;
    client.activeBounties.set(bounty.id, bounty);

    await interaction.update({
      content: '📢 **Bounty approved and started immediately.**',
      embeds: [],
      components: []
    });

    return;
  }

  // Scheduled bounty: create announcement embed now
  const announceEmbed = new EmbedBuilder()
    .setTitle('⏳ Upcoming Bounty')
    .setDescription('A bounty has been approved and is scheduled to start soon.')
    .addFields(
      { name: 'Trainer', value: `<@${bounty.requesterId}>`, inline: true },
      { name: 'Rarity', value: rarityLabel, inline: true },
      {
        name: 'Pokémon Targets',
        value: bounty.pokemons.map(p => `• ${p}`).join('\n') || '—',
        inline: false
      },
      { name: 'Reward', value: rewardLabel, inline: false },
      { name: 'Starts', value: startLabel, inline: true },
      { name: 'Ends', value: endLabel, inline: true },
      { name: 'Duration', value: durationLabel, inline: true }
    )
    .setFooter({ text: `Bounty ID: ${bounty.id}` })
    .setTimestamp();

  const announceMsg = await bountyChannel.send({
    content: mention || '',
    embeds: [announceEmbed]
  });

  bounty.announcementChannelId = announceMsg.channel.id;
  bounty.announcementMessageId = announceMsg.id;
  client.activeBounties.set(bounty.id, bounty);

  // Schedule activation
  const now = Date.now();
  const delay = Math.max(0, bounty.startTime.getTime() - now);

  setTimeout(async () => {
    try {
      const guild = await client.guilds.fetch(interaction.guildId);
      const channel = await guild.channels.fetch(bountyChannelId).catch(() => null);
      if (!channel) return;

      // Delete announcement if still there
      if (bounty.announcementChannelId && bounty.announcementMessageId) {
        try {
          const annChannel = await guild.channels
            .fetch(bounty.announcementChannelId)
            .catch(() => null);
          if (annChannel) {
            const m = await annChannel.messages
              .fetch(bounty.announcementMessageId)
              .catch(() => null);
            if (m) await m.delete().catch(() => {});
          }
        } catch {
          // ignore
        }
      }

      // Render and send card
      const buffer = await createBountyCard({
        bountyId: bounty.id,
        username: displayName,
        rankName,
        rarityKey,
        rarityLabel,
        pokemons: bounty.pokemons,
        startLabel,
        endLabel,
        durationLabel,
        note: bounty.notes,
        rewardLabel,
        avatarUrl
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claimbounty_${bounty.id}`)
          .setLabel('Claim Bounty')
          .setStyle(ButtonStyle.Success)
      );

      const msg = await channel.send({
        content: mention || '',
        files: [{ attachment: buffer, name: 'bounty-card.png' }],
        components: [row]
      });

      bounty.messageId = msg.id;
      bounty.channelId = msg.channel.id;
      client.activeBounties.set(bounty.id, bounty);
    } catch (err) {
      console.error('Error auto-starting bounty:', err);
    }
  }, delay);

  await interaction.update({
    content: '📢 **Bounty approved and scheduled.**',
    embeds: [],
    components: []
  });
}

// ─────────────────────────────────────────────
// DENY BOUNTY
// ─────────────────────────────────────────────
async function handleDenyBounty(client, interaction) {
  if (
    !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) &&
    !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply({
      content: '❌ You do not have permission to deny bounties.',
      ephemeral: true
    });
  }

  const bountyId = interaction.customId.replace('denybounty_', '');
  if (!client.pendingBounties) client.pendingBounties = new Map();

  const bounty = client.pendingBounties.get(bountyId);
  if (!bounty) {
    return interaction.reply({
      content: '❌ Could not find that bounty.',
      ephemeral: true
    });
  }

  client.pendingBounties.delete(bountyId);

  return interaction.update({
    content: '❌ Bounty denied.',
    embeds: [],
    components: []
  });
}

// ─────────────────────────────────────────────
// CLAIM BOUNTY → OPEN MODAL
// ─────────────────────────────────────────────
async function handleClaimBounty(client, interaction) {
  const bountyId = interaction.customId.replace('claimbounty_', '');
  if (!client.activeBounties) client.activeBounties = new Map();

  const bounty = client.activeBounties.get(bountyId);
  if (!bounty) {
    return interaction.reply({
      content: '❌ This bounty is no longer active.',
      ephemeral: true
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`bountyclaim_${bountyId}`)
    .setTitle('Claim Bounty');

  const proofInput = new TextInputBuilder()
    .setCustomId('proof_id')
    .setLabel('Pokémon ID / Proof')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const noteInput = new TextInputBuilder()
    .setCustomId('extra_note')
    .setLabel('Additional notes (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const row1 = new ActionRowBuilder().addComponents(proofInput);
  const row2 = new ActionRowBuilder().addComponents(noteInput);

  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}
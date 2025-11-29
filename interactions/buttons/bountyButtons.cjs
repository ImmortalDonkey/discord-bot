
// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');

const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');
const { createBountyCard } = require('../../renderers/cardRenderer.cjs');

function formatUk(dateMs) {
  const d = new Date(dateMs);
  return d.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    hour12: false
  });
}

function buildRarityPing(rarityKey) {
  const allRole = process.env.ROLE_BOUNTY_ALL || null;

  let specificEnv = null;
  switch (rarityKey) {
    case 'roamerMonth':
      specificEnv = 'ROLE_ROAMERMONTH';
      break;
    case 'paradox':
      specificEnv = 'ROLE_PARADOX';
      break;
    case 'legendary':
      specificEnv = 'ROLE_LEGENDARY';
      break;
    case 'rare':
      specificEnv = 'ROLE_RARE';
      break;
    case 'common':
      specificEnv = 'ROLE_COMMON';
      break;
    default:
      specificEnv = null;
  }

  const specificRole = specificEnv ? process.env[specificEnv] : null;

  const parts = [];
  if (allRole) parts.push(`<@&${allRole}>`);
  if (specificRole) parts.push(`<@&${specificRole}>`);

  return parts.join(' ');
}

module.exports = {
  ids: ['approvebounty_', 'denybounty_', 'claimbounty_'],

  async execute(client, interaction) {
    const id = interaction.customId;

    // ───────────────────────────────
    // 1. APPROVE BOUNTY
    // ───────────────────────────────
    if (id.startsWith('approvebounty_')) {
      if (
        !interaction.member.permissions.has(
          PermissionFlagsBits.ManageGuild
        )
      ) {
        return interaction.reply({
          content: '❌ You do not have permission to approve bounties.',
          ephemeral: true
        });
      }

      const bountyId = id.replace('approvebounty_', '');
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: '❌ Could not find that bounty. It may already be processed.',
          ephemeral: true
        });
      }

      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
      const bountyChannel = bountyChannelId
        ? await interaction.guild.channels.fetch(bountyChannelId).catch(() => null)
        : null;

      if (!bountyChannel) {
        return interaction.reply({
          content: '❌ Bounty channel (BOUNTY_CHANNEL_ID) is not configured or cannot be found.',
          ephemeral: true
        });
      }

      // Build ping string
      const pingText = buildRarityPing(bounty.rarityKey);

      // Trainer info
      const member = await interaction.guild.members
        .fetch(bounty.requesterId)
        .catch(() => null);

      const displayName =
        member?.nickname ||
        member?.user?.globalName ||
        member?.user?.username ||
        bounty.requesterName ||
        'Unknown Trainer';

      const avatarUrl =
        member?.displayAvatarURL({ size: 512, extension: 'png' }) ||
        interaction.client.user.displayAvatarURL({
          size: 512,
          extension: 'png'
        });

      // Rank from DB (lifetime_points)
      let rankName = 'Rookie Trainer';
      try {
        const row = await db.getUserById(bounty.requesterId);
        if (row) {
          rankName = getRankName(row.lifetime_points || 0);
        }
      } catch {
        // ignore, fall back to default rank
      }

      const startLabelForCard = bounty.startsNow
        ? 'Starts Immediately'
        : formatUk(bounty.startTime);

      const endLabelForCard = formatUk(bounty.endTime);
      const durationLabel = `${bounty.durationHours} hour(s)`;

      // Helper to send the actual card when bounty becomes active
      const sendCard = async () => {
        const cardPath = await createBountyCard({
          bountyId,
          username: displayName,
          rankName,
          rarityKey: bounty.rarityKey,
          rarityLabel: bounty.rarityLabel,
          pokemons: bounty.pokemons,
          startLabel: startLabelForCard,
          endLabel: endLabelForCard,
          durationLabel,
          note: bounty.notes,
          rewardLabel: `${bounty.reward.toLocaleString()} PKD`,
          avatarUrl
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`claimbounty_${bountyId}`)
            .setLabel('Claim Bounty')
            .setStyle(ButtonStyle.Success)
        );

        const sent = await bountyChannel.send({
          content: pingText || null,
          files: [{ attachment: cardPath, name: `bounty_${bountyId}.png` }],
          components: [row]
        });

        bounty.cardMessageId = sent.id;
        bounty.cardChannelId = sent.channel.id;
      };

      // If starts now → no announcement, card immediately
      if (bounty.startsNow) {
        await sendCard();

        return interaction.reply({
          content: '📢 Bounty approved and started immediately!',
          ephemeral: false
        });
      }

      // Otherwise: schedule → announcement now, card later
      const startUnix = Math.floor(bounty.startTime / 1000);
      const endUnix = Math.floor(bounty.endTime / 1000);

      const announceEmbed = new EmbedBuilder()
        .setTitle('📣 Scheduled Bounty')
        .setDescription('A new bounty has been approved and will start soon.')
        .addFields(
          { name: 'Trainer', value: `<@${bounty.requesterId}>`, inline: true },
          { name: 'Rarity', value: bounty.rarityLabel, inline: true },
          {
            name: 'Reward',
            value: `${bounty.reward.toLocaleString()} PKD`,
            inline: false
          },
          {
            name: 'Targets',
            value: bounty.pokemons.join('\n'),
            inline: false
          },
          { name: 'Starts', value: `<t:${startUnix}:F>`, inline: true },
          { name: 'Ends', value: `<t:${endUnix}:F>`, inline: true },
          { name: 'Duration', value: durationLabel, inline: true }
        )
        .setFooter({ text: `Bounty ID: ${bountyId}` })
        .setTimestamp();

      const announceMsg = await bountyChannel.send({
        content: pingText || null,
        embeds: [announceEmbed]
      });

      bounty.announcementMessageId = announceMsg.id;
      bounty.announcementChannelId = announceMsg.channel.id;

      const delay = Math.max(0, bounty.startTime - Date.now());

      setTimeout(async () => {
        try {
          const guild = client.guilds.cache.get(interaction.guildId);
          if (!guild) return;

          // Delete announcement if still there
          if (bounty.announcementChannelId && bounty.announcementMessageId) {
            const chan = await guild.channels
              .fetch(bounty.announcementChannelId)
              .catch(() => null);
            if (chan && chan.isTextBased?.()) {
              const msg = await chan.messages
                .fetch(bounty.announcementMessageId)
                .catch(() => null);
              if (msg) await msg.delete().catch(() => {});
            }
          }

          await sendCard();
        } catch (err) {
          console.error('Error activating scheduled bounty:', err);
        }
      }, delay);

      return interaction.reply({
        content: '✅ Bounty approved and scheduled.',
        ephemeral: false
      });
    }

    // ───────────────────────────────
    // 2. DENY BOUNTY
    // ───────────────────────────────
    if (id.startsWith('denybounty_')) {
      if (
        !interaction.member.permissions.has(
          PermissionFlagsBits.ManageGuild
        )
      ) {
        return interaction.reply({
          content: '❌ You do not have permission to deny bounties.',
          ephemeral: true
        });
      }

      const bountyId = id.replace('denybounty_', '');
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: '❌ Could not find that bounty.',
          ephemeral: true
        });
      }

      client.pendingBounties.delete(bountyId);

      return interaction.reply({
        content: '❌ Bounty denied.',
        ephemeral: false
      });
    }

    // ───────────────────────────────
    // 3. CLAIM BOUNTY
    // (simple version – just marks attempted claim, no thread yet)
    // ───────────────────────────────
    if (id.startsWith('claimbounty_')) {
      const bountyId = id.replace('claimbounty_', '');
      const bounty = client.activeBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: '❌ This bounty is no longer active.',
          ephemeral: true
        });
      }

      const now = Date.now();
      if (now < bounty.startTime || now > bounty.endTime) {
        return interaction.reply({
          content: '❌ This bounty is not currently active.',
          ephemeral: true
        });
      }

      const userId = interaction.user.id;

      // Prevent duplicate claims per bounty
      if (!client.bountyClaims.has(bountyId)) {
        client.bountyClaims.set(bountyId, new Set());
      }
      const claimSet = client.bountyClaims.get(bountyId);

      if (claimSet.has(userId)) {
        return interaction.reply({
          content: '⚠ You have already claimed this bounty.',
          ephemeral: true
        });
      }

      claimSet.add(userId);

      // (Later we can hook in a modal + thread here)
      return interaction.reply({
        content: '📝 Claim submitted! Staff will verify shortly.',
        ephemeral: true
      });
    }
  }
};
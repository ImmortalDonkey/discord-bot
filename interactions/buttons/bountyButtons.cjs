// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { postBountyCard } = require('../../utils/bountyScheduler.cjs');
const {
  getHighestRarityForList,
  getRarityDisplayLabel,
} = require('../../utils/rarity.cjs');

function isStaff(member) {
  const staffEnv = process.env.STAFF_ROLES || '';
  const staffIds = staffEnv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (staffIds.length === 0) {
    return member.permissions.has(PermissionFlagsBits.ManageGuild);
  }

  return member.roles.cache.some(r => staffIds.includes(r.id));
}

module.exports = {
  ids: ['approvebounty_', 'denybounty_', 'claimbounty_'],

  async execute(client, interaction) {
    const id = interaction.customId;

    // -------------------------------------------------------
    // 🟢 APPROVE BOUNTY
    // -------------------------------------------------------
    if (id.startsWith('approvebounty_')) {
      const bountyId = id.replace('approvebounty_', '');
      const bounty = client.pendingBounties.get(bountyId);

      if (!isStaff(interaction.member)) {
        return interaction.reply({
          content: '❌ You do not have permission to approve bounties.',
          ephemeral: true,
        });
      }

      if (!bounty) {
        return interaction.reply({
          content: '❌ This bounty no longer exists.',
          ephemeral: true,
        });
      }

      // Move to active map
      client.pendingBounties.delete(bountyId);
      bounty.approved = true;
      client.activeBounties.set(bountyId, bounty);

      const rarityKey = getHighestRarityForList(bounty.pokemons);
      const rarityLabel = getRarityDisplayLabel(rarityKey);

      // If "Start Now" → immediately post card and claim button
      if (bounty.startsNow) {
        await postBountyCard(client, bountyId);

        return interaction.reply({
          content: '✅ Bounty approved and started immediately!',
          ephemeral: true,
        });
      }

      // Otherwise → scheduled bounty: post announcement embed now
      const channelId = process.env.BOUNTY_CHANNEL_ID;
      const channel = interaction.guild.channels.cache.get(channelId);

      if (!channel) {
        return interaction.reply({
          content:
            '✅ Bounty approved, but bounty-hunting channel is not configured.',
          ephemeral: true,
        });
      }

      const startUnix = Math.floor(bounty.startTime / 1000);
      const rewardLabel = `${Number(bounty.reward || 0).toLocaleString()} PKD`;

      const embed = new EmbedBuilder()
        .setTitle('📢 Bounty Scheduled')
        .setDescription('A new bounty has been approved and is scheduled to begin.')
        .addFields(
          {
            name: 'Trainer',
            value: `<@${bounty.requesterId}>`,
            inline: true,
          },
          {
            name: 'Rarity',
            value: rarityLabel,
            inline: true,
          },
          {
            name: 'Starts',
            value: `<t:${startUnix}:F>`,
            inline: false,
          },
          {
            name: 'Reward',
            value: rewardLabel,
            inline: false,
          },
        );

      // Ping: global bounty + rarity role
      const rarityEnv = `ROLE_${rarityKey.toUpperCase()}`;
      const rarityRoleId = process.env[rarityEnv];
      const bountyAllRoleId = process.env.ROLE_BOUNTY_ALL;

      let pingText = '';
      if (bountyAllRoleId) pingText += `<@&${bountyAllRoleId}> `;
      if (rarityRoleId) pingText += `<@&${rarityRoleId}>`;

      const msg = await channel.send({
        content: pingText.trim(),
        embeds: [embed],
      });

      bounty.announcementId = msg.id;
      client.activeBounties.set(bountyId, bounty);

      return interaction.reply({
        content: '✅ Bounty approved and scheduled.',
        ephemeral: true,
      });
    }

    // -------------------------------------------------------
    // 🔴 DENY BOUNTY
    // -------------------------------------------------------
    if (id.startsWith('denybounty_')) {
      const bountyId = id.replace('denybounty_', '');

      if (!isStaff(interaction.member)) {
        return interaction.reply({
          content: '❌ You do not have permission to deny bounties.',
          ephemeral: true,
        });
      }

      const bounty = client.pendingBounties.get(bountyId);
      if (!bounty) {
        return interaction.reply({
          content: '❌ This bounty no longer exists.',
          ephemeral: true,
        });
      }

      client.pendingBounties.delete(bountyId);

      return interaction.reply({
        content: '❌ Bounty denied.',
        ephemeral: true,
      });
    }

    // -------------------------------------------------------
    // 🟡 CLAIM BOUNTY → OPEN MODAL
    // -------------------------------------------------------
    if (id.startsWith('claimbounty_')) {
      const bountyId = id.replace('claimbounty_', '');
      const bounty = client.activeBounties.get(bountyId);

      if (!bounty || !bounty.hasStarted) {
        return interaction.reply({
          content: '❌ This bounty is no longer active.',
          ephemeral: true,
        });
      }

      // Modal customId must match bountyClaimModal.cjs: "bounty_claim_<bountyId>_<userId>"
      const modal = new ModalBuilder()
        .setCustomId(`bounty_claim_${bountyId}_${interaction.user.id}`)
        .setTitle('Bounty Claim');

      const pokemonIdInput = new TextInputBuilder()
        .setCustomId('pokemon_id')
        .setLabel('Pokémon ID (required)')
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      const proofInput = new TextInputBuilder()
        .setCustomId('proof_optional')
        .setLabel('Screenshot / notes (optional)')
        .setRequired(false)
        .setStyle(TextInputStyle.Paragraph);

      modal.addComponents(
        new ActionRowBuilder().addComponents(pokemonIdInput),
        new ActionRowBuilder().addComponents(proofInput),
      );

      return interaction.showModal(modal);
    }
  },
};
// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');

const { getRankName } = require('../../utils/rankSystem.cjs');
const { getRarity, getRarityDisplayLabel } = require('../../utils/rarity.cjs');
const { createBountyCard } = require('../../renderers/cardRenderer.cjs');

module.exports = {
  // We treat these as *prefixes* in buttonHandler.cjs
  ids: ['approvebounty_', 'denybounty_'],

  /**
   * Handles:
   *   approvebounty_<bountyId>
   *   denybounty_<bountyId>
   */
  async execute(client, interaction) {
    const customId = interaction.customId; // e.g. "approvebounty_123_456"
    const [actionRaw, bountyId] = customId.split('_'); // ["approvebounty", "<id>"]
    const isApprove = actionRaw === 'approvebounty';

    // Basic permission check for staff-only buttons
    const perms = interaction.memberPermissions;
    if (
      !perms.has(PermissionFlagsBits.ManageGuild) &&
      !perms.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: '❌ You do not have permission to manage bounties.',
        ephemeral: true,
      });
    }

    if (!client.pendingBounties) client.pendingBounties = new Map();
    if (!client.activeBounties) client.activeBounties = new Map();

    const pendingBounties = client.pendingBounties;
    const activeBounties = client.activeBounties;

    const bounty = pendingBounties.get(bountyId);
    if (!bounty) {
      return interaction.reply({
        content: '❌ Could not find that bounty. It may have already been processed.',
        ephemeral: true,
      });
    }

    // DENY ─────────────────────────────────────────────
    if (!isApprove) {
      pendingBounties.delete(bountyId);

      try {
        await interaction.update({
          content: '❌ Bounty request denied.',
          embeds: [],
          components: [],
        });
      } catch {
        // If message already changed, fallback to reply
        await interaction.reply({
          content: '❌ Bounty request denied.',
          ephemeral: true,
        }).catch(() => {});
      }

      // Optionally DM requester
      try {
        const requester = await client.users.fetch(bounty.requesterId);
        await requester.send(
          `❌ Your bounty request for **${bounty.pokemons.join(', ')}** was denied by **${interaction.user.username}**.`
        );
      } catch {
        // ignore DM failures
      }

      return;
    }

    // APPROVE ──────────────────────────────────────────

    // Move from pending → active
    pendingBounties.delete(bountyId);
    activeBounties.set(bountyId, bounty);

    const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
    const bountyChannel = bountyChannelId
      ? await interaction.guild.channels.fetch(bountyChannelId).catch(() => null)
      : null;

    if (!bountyChannel) {
      return interaction.reply({
        content:
          '✅ Bounty approved, but I could not find the bounty channel. Please check `BOUNTY_CHANNEL_ID`.',
        ephemeral: true,
      });
    }

    // Try to fetch requester user & rank
    let requesterUser = null;
    try {
      requesterUser = await client.users.fetch(bounty.requesterId);
    } catch {
      requesterUser = null;
    }

    const rankName = bounty.requesterLifetimePoints
      ? getRankName(bounty.requesterLifetimePoints)
      : 'Hunter';

    // Rarity based on main target (pokemon1)
    const mainPokemon = bounty.pokemons[0];
    const rarityKey = mainPokemon ? getRarity(mainPokemon) : 'common';
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // Time labels
    const startUnix = Math.floor(bounty.startTime.getTime() / 1000);
    const endUnix = Math.floor(bounty.endTime.getTime() / 1000);

    const startLabel = `<t:${startUnix}:F>`;
    const endLabel = `<t:${endUnix}:F>`;
    const durationLabel = `${bounty.durationHours} hour(s)`;
    const rewardLabel = `${bounty.reward.toLocaleString()} PKD`;
    const note = bounty.notes || '—';

    // ─────────────────────────────────────────────
    // Create fancy canvas card with cardRenderer
    // ─────────────────────────────────────────────
    let attachment = null;
    try {
      const cardPath = await createBountyCard({
        bountyId,
        username: bounty.requesterName,
        rankName,
        rarityKey,
        rarityLabel,
        pokemons: bounty.pokemons,
        startLabel,
        endLabel,
        durationLabel,
        note,
        rewardLabel,
        avatarUrl: requesterUser
          ? requesterUser.displayAvatarURL({ extension: 'png', size: 256 })
          : null,
      });

      attachment = new AttachmentBuilder(cardPath, {
        name: `bounty_${bountyId}.png`,
      });
    } catch (err) {
      console.error('❌ Failed to generate bounty card:', err);
    }

    // Claim button
    const claimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bountyclaim_${bountyId}`)
        .setLabel('Claim Bounty')
        .setStyle(ButtonStyle.Primary)
    );

    // Fallback embed (even if card rendering fails)
    const embed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('🎯 Active Bounty')
      .setDescription('A bounty has been approved and is now live!')
      .addFields(
        { name: 'Requester', value: `<@${bounty.requesterId}>`, inline: true },
        { name: 'Rarity', value: rarityLabel, inline: true },
        { name: 'Reward', value: rewardLabel, inline: false },
        {
          name: 'Targets',
          value: bounty.pokemons.map(p => `• ${p}`).join('\n'),
          inline: false,
        },
        { name: 'Start', value: startLabel, inline: true },
        { name: 'End', value: endLabel, inline: true },
        { name: 'Duration', value: durationLabel, inline: true },
        { name: 'Notes', value: note, inline: false }
      )
      .setTimestamp();

    const sendPayload = {
      embeds: [embed],
      components: [claimRow],
    };

    if (attachment) {
      sendPayload.files = [attachment];
    }

    const bountyMessage = await bountyChannel.send(sendPayload);

    // Keep a reference to the message for later (optional)
    bounty.messageChannelId = bountyChannel.id;
    bounty.messageId = bountyMessage.id;
    activeBounties.set(bountyId, bounty);

    // Update the original request message
    await interaction.update({
      content: '✅ Bounty approved and posted in the bounty channel.',
      components: [],
    });

    // DM the requester
    try {
      if (requesterUser) {
        await requesterUser.send(
          `✅ Your bounty for **${bounty.pokemons.join(
            ', '
          )}** has been approved and is now live in <#${bountyChannelId}>.`
        );
      }
    } catch {
      // ignore DM failures
    }
  },
};

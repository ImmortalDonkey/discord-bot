// interactions/buttons/bountyClaimButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');

const CLAIMS_FORUM_ID = process.env.CLAIMS_FORUM_CHANNEL_ID || null;

module.exports = {
  // Prefixes recognised by handlers/buttonHandler.cjs
  ids: ['bountyclaim_', 'approvebountyclaim_', 'denybountyclaim_'],

  /**
   * Handles:
   *   bountyclaim_<bountyId>
   *   approvebountyclaim_<bountyId>_<hunterId>
   *   denybountyclaim_<bountyId>_<hunterId>
   */
  async execute(client, interaction) {
    const { customId } = interaction;

    // HUNTER presses "Claim Bounty"
    if (customId.startsWith('bountyclaim_')) {
      return handleHunterClaim(client, interaction);
    }

    // STAFF approves / denies
    if (
      customId.startsWith('approvebountyclaim_') ||
      customId.startsWith('denybountyclaim_')
    ) {
      return handleStaffDecision(client, interaction);
    }
  },
};

// ─────────────────────────────────────────────
// Hunter presses Claim Bounty
// ─────────────────────────────────────────────
async function handleHunterClaim(client, interaction) {
  const bountyId = interaction.customId.split('_')[1];

  if (!client.activeBounties) client.activeBounties = new Map();
  if (!client.bountyClaims) client.bountyClaims = new Map();

  const bounty = client.activeBounties.get(bountyId);
  if (!bounty) {
    return interaction.reply({
      content: '❌ This bounty is no longer active.',
      ephemeral: true,
    });
  }

  const hunterId = interaction.user.id;
  const claimKey = `${bountyId}:${hunterId}`;

  if (client.bountyClaims.has(claimKey)) {
    return interaction.reply({
      content: '⚠ You already have a pending claim for this bounty.',
      ephemeral: true,
    });
  }

  // Create / find the claims forum
  if (!CLAIMS_FORUM_ID) {
    return interaction.reply({
      content:
        '❌ Claim system not configured. Ask an admin to set `CLAIMS_FORUM_CHANNEL_ID`.',
      ephemeral: true,
    });
  }

  const forum = await interaction.guild.channels
    .fetch(CLAIMS_FORUM_ID)
    .catch(() => null);

  if (!forum) {
    return interaction.reply({
      content:
        '❌ I could not find the claims forum channel. Please check `CLAIMS_FORUM_CHANNEL_ID`.',
      ephemeral: true,
    });
  }

  // Create a thread for this specific claim
  const threadName = `Claim • ${interaction.user.username} • ${bounty.pokemons[0] || 'Bounty'}`;
  const thread = await forum.threads.create({
    name: threadName,
    message: {
      content: `<@&${process.env.STAFF_ROLE_ID || ''}> New bounty claim from <@${hunterId}>`,
    },
  });

  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('📨 Bounty Claim Submitted')
    .setDescription('A hunter has submitted a claim for an active bounty.')
    .addFields(
      { name: 'Hunter', value: `<@${hunterId}>`, inline: true },
      { name: 'Requester', value: `<@${bounty.requesterId}>`, inline: true },
      {
        name: 'Targets',
        value: bounty.pokemons.map(p => `• ${p}`).join('\n'),
        inline: false,
      },
      {
        name: 'Reward',
        value: `${bounty.reward.toLocaleString()} PKD`,
        inline: true,
      },
      {
        name: 'Notes',
        value: bounty.notes || '—',
        inline: false,
      }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approvebountyclaim_${bountyId}_${hunterId}`)
      .setLabel('Approve Claim')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`denybountyclaim_${bountyId}_${hunterId}`)
      .setLabel('Deny Claim')
      .setStyle(ButtonStyle.Danger)
  );

  await thread.send({ embeds: [embed], components: [row] });

  // Track claim in memory
  client.bountyClaims.set(claimKey, {
    bountyId,
    hunterId,
    threadId: thread.id,
    createdAt: new Date(),
  });

  return interaction.reply({
    content: `✅ Claim submitted in <#${thread.id}>. Staff will review it shortly.`,
    ephemeral: true,
  });
}

// ─────────────────────────────────────────────
// Staff Approve / Deny
// ─────────────────────────────────────────────
async function handleStaffDecision(client, interaction) {
  const isApprove = interaction.customId.startsWith('approvebountyclaim_');

  const [, bountyId, hunterId] = interaction.customId.split('_');

  const perms = interaction.memberPermissions;
  if (
    !perms.has(PermissionFlagsBits.ManageGuild) &&
    !perms.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply({
      content: '❌ You do not have permission to process bounty claims.',
      ephemeral: true,
    });
  }

  if (!client.bountyClaims) client.bountyClaims = new Map();
  const claimKey = `${bountyId}:${hunterId}`;
  const claim = client.bountyClaims.get(claimKey);

  if (!claim) {
    return interaction.reply({
      content: '❌ Could not find this claim (it may have been handled already).',
      ephemeral: true,
    });
  }

  // Update the claim message in the thread
  const message = interaction.message;
  const embed = EmbedBuilder.from(message.embeds[0] ?? new EmbedBuilder());

  if (isApprove) {
    embed.setColor('Green').addFields({
      name: 'Status',
      value: `✅ Approved by ${interaction.user}`,
    });
  } else {
    embed.setColor('Red').addFields({
      name: 'Status',
      value: `❌ Denied by ${interaction.user}`,
    });
  }

  await interaction.update({
    embeds: [embed],
    components: [], // remove buttons
  });

  // DM the hunter
  try {
    const hunter = await client.users.fetch(hunterId);
    if (isApprove) {
      await hunter.send(
        `✅ Your bounty claim for **${claim.bountyId}** was **approved** by **${interaction.user.username}**.\n` +
          `The reward is **${(client.activeBounties.get(bountyId)?.reward || 0).toLocaleString()} PKD** from the requester.`
      );
    } else {
      await hunter.send(
        `❌ Your bounty claim for **${claim.bountyId}** was **denied** by **${interaction.user.username}**.`
      );
    }
  } catch {
    // ignore DM failures
  }

  // Remove from in-memory claims
  client.bountyClaims.delete(claimKey);
}

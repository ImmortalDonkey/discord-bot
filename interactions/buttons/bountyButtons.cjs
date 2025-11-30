// interactions/buttons/bountyButtons.cjs
const {
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const db = require('../../database.cjs');
const {
  getBountyAnnouncementChannel,
} = require('../../utils/channelResolver.cjs');
const { postBountyCard } = require('../../utils/bountyScheduler.cjs');

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

// ───────────────────────────────
// STAFF CHECK
// ───────────────────────────────
function isStaffMember(member) {
  const staffRolesEnv = process.env.STAFF_ROLES || '';
  const staffRoles = staffRolesEnv
    .split(',')
    .map(r => r.trim())
    .filter(Boolean);

  const memberRoles = member.roles.cache.map(r => r.id);

  const hasStaffRole = staffRoles.some(r => memberRoles.includes(r));
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

  return hasStaffRole || isAdmin;
}

// ───────────────────────────────
// APPROVE BOUNTY
// ───────────────────────────────
async function handleApproveBounty(client, interaction) {
  if (!isStaffMember(interaction.member)) {
    return interaction.reply({
      content: '❌ You do not have permission to approve bounties.',
      ephemeral: true
    });
  }

  const bountyId = interaction.customId.replace('approvebounty_', '');
  const bounty = await db.getBountyById(bountyId);

  if (!bounty || bounty.status !== 'pending') {
    return interaction.reply({
      content: '❌ This bounty is not in a pending state or no longer exists.',
      ephemeral: true
    });
  }

  const nowMs = Date.now();

  // Update DB: mark as open
  await db.updateBounty(bountyId, {
    status: 'open',
    approved_at: nowMs
  });

  const guild = interaction.guild;

  // Update the request-thread message (remove buttons & tag as approved)
  try {
    if (bounty.request_thread_id && bounty.request_message_id) {
      const thread = await guild.channels.fetch(bounty.request_thread_id).catch(() => null);
      const msg = thread
        ? await thread.messages.fetch(bounty.request_message_id).catch(() => null)
        : null;

      if (msg) {
        const originalEmbed = msg.embeds[0]
          ? EmbedBuilder.from(msg.embeds[0])
          : new EmbedBuilder().setTitle('📝 Bounty Request');

        originalEmbed.setColor('Green').addFields({
          name: 'Status',
          value: `✅ Approved by <@${interaction.user.id}>`,
          inline: false
        });

        await msg.edit({
          embeds: [originalEmbed],
          components: []
        });
      }
    }
  } catch (err) {
    console.error('Error updating bounty request message:', err);
  }

  // Reload bounty with latest data
  const updatedBounty = await db.getBountyById(bountyId);

  const startsNow = !!updatedBounty.starts_immediately || updatedBounty.start_time <= nowMs;

  if (startsNow) {
    // Start immediately: post bounty card now, skip announcement
    const msg = await postBountyCard(client, updatedBounty);
    if (!msg) {
      return interaction.reply({
        content: '⚠ Bounty approved, but failed to post the bounty card.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: '✅ Bounty approved and **card posted immediately**.',
      ephemeral: true
    });
  } else {
    // Scheduled future start: send announcement embed with pings
    const announcementChannel = await getBountyAnnouncementChannel(guild);

    if (!announcementChannel) {
      await interaction.reply({
        content: '⚠ Bounty approved, but announcement channel is not configured.',
        ephemeral: true
      });
      return;
    }

    const pokemons = JSON.parse(updatedBounty.pokemons || '[]');
    const pokemonList = pokemons.map(p => `• ${p}`).join('\n') || 'None';

    const startUnix = Math.floor(updatedBounty.start_time / 1000);
    const endUnix = Math.floor(updatedBounty.end_time / 1000);

    const rarityRoleEnvKey = `ROLE_${(updatedBounty.rarity_key || 'COMMON').toUpperCase()}`;
    const rarityRoleId = process.env[rarityRoleEnvKey];
    const bountyAllRoleId = process.env.ROLE_BOUNTY_ALL;

    let pingText = '';
    if (bountyAllRoleId) pingText += `<@&${bountyAllRoleId}> `;
    if (rarityRoleId) pingText += `<@&${rarityRoleId}>`;

    const annEmbed = new EmbedBuilder()
      .setTitle('📢 Bounty Scheduled')
      .setDescription('A new bounty has been approved and will start soon.')
      .addFields(
        { name: 'Trainer', value: `<@${updatedBounty.requester_id}>`, inline: true },
        { name: 'Rarity', value: updatedBounty.rarity_label || 'Unknown', inline: true },
        { name: 'Reward', value: `${Number(updatedBounty.reward || 0).toLocaleString()} PKD`, inline: false },
        { name: 'Pokémon Targets', value: pokemonList, inline: false },
        { name: 'Starts', value: `<t:${startUnix}:F>`, inline: true },
        { name: 'Ends', value: `<t:${endUnix}:F>`, inline: true },
        { name: 'Duration', value: `${updatedBounty.duration_hours} hour(s)`, inline: true },
        { name: 'Bounty ID', value: updatedBounty.id, inline: false }
      )
      .setColor('Blue')
      .setTimestamp();

    const annMsg = await announcementChannel.send({
      content: pingText.trim(),
      embeds: [annEmbed]
    });

    await db.updateBounty(bountyId, {
      announcement_channel_id: announcementChannel.id,
      announcement_message_id: annMsg.id
    });

    await interaction.reply({
      content: '✅ Bounty approved. Announcement posted in the bounty channel.',
      ephemeral: true
    });
  }
}

// ───────────────────────────────
// DENY BOUNTY
// ───────────────────────────────
async function handleDenyBounty(client, interaction) {
  if (!isStaffMember(interaction.member)) {
    return interaction.reply({
      content: '❌ You do not have permission to deny bounties.',
      ephemeral: true
    });
  }

  const bountyId = interaction.customId.replace('denybounty_', '');
  const bounty = await db.getBountyById(bountyId);

  if (!bounty || bounty.status !== 'pending') {
    return interaction.reply({
      content: '❌ This bounty is not in a pending state or no longer exists.',
      ephemeral: true
    });
  }

  await db.updateBounty(bountyId, { status: 'rejected' });

  // DM the requester
  try {
    const user = await client.users.fetch(bounty.requester_id);
    await user.send(
      `❌ Your bounty request for **${bounty.id}** has been rejected by staff.\n\n` +
      `If you have questions, please contact the staff team.`
    );
  } catch (err) {
    console.warn('Could not DM bounty requester:', err.message);
  }

  // Delete the request thread
  try {
    if (bounty.request_thread_id) {
      const thread = await interaction.guild.channels.fetch(bounty.request_thread_id).catch(() => null);
      if (thread) {
        await thread.delete().catch(() => {});
      }
    }
  } catch (err) {
    console.error('Error deleting bounty request thread:', err);
  }

  return interaction.reply({
    content: '❌ Bounty has been rejected and the requester has been notified.',
    ephemeral: true
  });
}

// ───────────────────────────────
// CLAIM BOUNTY (opens modal)
// ───────────────────────────────
async function handleClaimBounty(client, interaction) {
  const bountyId = interaction.customId.replace('claimbounty_', '');
  const bounty = await db.getBountyById(bountyId);

  if (!bounty || bounty.status !== 'open') {
    return interaction.reply({
      content: '❌ This bounty is not currently open.',
      ephemeral: true
    });
  }

  const now = Date.now();
  if (now < bounty.start_time || now > bounty.end_time) {
    return interaction.reply({
      content: '❌ This bounty is not active at the moment (outside the time window).',
      ephemeral: true
    });
  }

  const modalCustomId = `bounty_claim_${bountyId}_${interaction.user.id}`;

  return interaction.showModal({
    customId: modalCustomId,
    title: 'Submit Bounty Claim',
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            customId: 'pokemon_id',
            label: 'Pokémon ID (required)',
            style: 1,
            required: true
          }
        ]
      },
      {
        type: 1,
        components: [
          {
            type: 4,
            customId: 'proof_optional',
            label: 'Screenshot / Notes (optional)',
            style: 2,
            required: false
          }
        ]
      }
    ]
  });
}
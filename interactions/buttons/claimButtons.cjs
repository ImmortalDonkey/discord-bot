// interactions/buttons/claimButtons.cjs
const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle
} = require('discord.js');

const db = require('../../database.cjs');

module.exports = {
  // Buttons handled here
  ids: [
    'claim_approve_',   // prefix
    'claim_close'       // exact
  ],

  async execute(client, interaction) {
    const id = interaction.customId;

    // STAFF APPROVES CLAIM
    if (id.startsWith('claim_approve_')) {
      return handleApprove(client, interaction);
    }

    // CLOSE TICKET
    if (id === 'claim_close') {
      return handleCloseTicket(client, interaction);
    }
  }
};

// ─────────────────────────────────────────────
// ✔ APPROVE POINT CLAIM
// ─────────────────────────────────────────────
async function handleApprove(client, interaction) {
  try {
    const parts = interaction.customId.split('_');
    // claim_approve_<userId>_<pointsRequested>
    const userId = parts[2];
    const pointsRequested = parseInt(parts[3], 10);

    const userRow = await db.getUserById(userId);
    const oldPoints = userRow?.points || 0;
    const newPoints = oldPoints - pointsRequested;

    // Deduct points
    await db.addPoints(userId, userRow.username, -pointsRequested, 'PKD Claim Approved');

    const pkdValue = pointsRequested * 200000;

    // Update embed in the thread
    const oldEmbed = interaction.message.embeds[0]
      ? EmbedBuilder.from(interaction.message.embeds[0])
      : new EmbedBuilder();

    const updatedEmbed = oldEmbed
      .setColor('Green')
      .setTitle('✔ Claim Approved')
      .setFields(
        { name: 'User', value: `<@${userId}>`, inline: true },
        { name: 'Points Deducted', value: `${pointsRequested}`, inline: true },
        { name: 'PKD Value', value: `${pkdValue.toLocaleString()} pkd`, inline: true },
        { name: 'Old Total', value: `${oldPoints}`, inline: true },
        { name: 'New Total', value: `${newPoints}`, inline: true }
      )
      .setTimestamp();

    // Replace buttons with ONLY "Close Ticket"
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('claim_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.update({
      embeds: [updatedEmbed],
      components: [row]
    });

  } catch (err) {
    console.error('❌ Approve claim error:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Failed to approve claim.',
        ephemeral: true
      }).catch(() => {});
    }
  }
}

// ─────────────────────────────────────────────
// ✔ CLOSE TICKET (AUTO DELETE IN 60 sec)
// ─────────────────────────────────────────────
async function handleCloseTicket(client, interaction) {
  await interaction.reply({
    content: '🔒 Ticket will close in **60 seconds**…',
    ephemeral: true
  });

  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, 60000);
}
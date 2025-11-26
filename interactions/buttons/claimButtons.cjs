// interactions/buttons/claimButtons.cjs
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const db = require('../../database.cjs');

module.exports = {
  ids: [
    'approveclaim_',
    'close_ticket'
  ],

  async execute(client, interaction) {
    const id = interaction.customId;

    // ================================
    // APPROVE CLAIM BUTTON
    // approveclaim_userId_points
    // ================================
    if (id.startsWith('approveclaim_')) {
      const [_, userId, pointsRequested] = id.split('_');

      const userRow = await db.getUserById(userId);
      const oldPoints = userRow?.points || 0;
      const newPoints = oldPoints - parseInt(pointsRequested);

      await db.addPoints(
        userId,
        userRow.username,
        -parseInt(pointsRequested),
        "PKD Claim"
      );

      const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('✔ Claim Approved')
        .setDescription(`Points successfully deducted for <@${userId}>.`)
        .addFields(
          { name: 'Points Requested', value: pointsRequested, inline: true },
          { name: 'Old Total', value: oldPoints.toString(), inline: true },
          { name: 'New Total', value: newPoints.toString(), inline: true }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Close Ticket")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row]
      });

      return;
    }

    // ================================
    // CLOSE TICKET BUTTON
    // ================================
    if (id === 'close_ticket') {
      await interaction.reply({
        content: "🔒 Ticket will close shortly...",
        ephemeral: true
      });

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 4000);

      return;
    }
  }
};


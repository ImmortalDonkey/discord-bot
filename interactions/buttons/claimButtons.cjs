// interactions/buttons/claimButtons.cjs
const {
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const db = require('../../database.cjs');

module.exports = {
  ids: ['claimapprove_'],

  async execute(client, interaction) {
    const id = interaction.customId;

    console.log("CLAIM BUTTON PRESSED:", id);

    // Format: claimapprove_<userId>_<points>
    const [, userId, pointsStr] = id.split('_');
    const points = parseInt(pointsStr, 10);

    if (!points || !userId) {
      return interaction.reply({
        content: '❌ Invalid button format.',
        ephemeral: true
      });
    }

    // ────────────────────────────────────────────────
    // PERMISSION CHECK
    // ────────────────────────────────────────────────
    const perms = interaction.memberPermissions;
    if (
      !perms.has(PermissionFlagsBits.ManageGuild) &&
      !perms.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: '❌ You do not have permission to approve claims.',
        ephemeral: true
      });
    }

    // ────────────────────────────────────────────────
    // CHECK USER'S POINTS AGAIN
    // ────────────────────────────────────────────────
    const row = await db.getUserById(userId);
    if (!row || row.points < points) {
      return interaction.reply({
        content: '❌ User no longer has enough points to claim.',
        ephemeral: true
      });
    }

    // Deduct points
    await db.addPoints(userId, row.username, -points, `Claimed PKD`);

    // Update embed in thread
    const message = interaction.message;
    const updated = EmbedBuilder.from(message.embeds[0]);

    updated.addFields({
      name: 'Status',
      value: `✅ Approved by <@${interaction.user.id}>`
    });

    await interaction.update({
      embeds: [updated],
      components: [] // remove buttons
    });

    // DM user
    try {
      const user = await client.users.fetch(userId);
      await user.send(
        `💸 Your claim for **${points} points** has been approved!\n` +
        `You now have **${row.points - points} points** remaining.`
      );
    } catch {}

    // ────────────────────────────────────────────────
    // AUTO DELETE THREAD AFTER 60 SECONDS
    // ────────────────────────────────────────────────
    const thread = interaction.channel;
    setTimeout(() => {
      thread.delete().catch(() => {});
    }, 60000);

    return;
  }
};
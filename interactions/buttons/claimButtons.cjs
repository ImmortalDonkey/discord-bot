// interactions/buttons/claimButtons.cjs
const {
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const db = require('../../database.cjs');

module.exports = {
  ids: ['claim_approve_'],

  async execute(client, interaction) {
    const { customId } = interaction;

    // Format: claim_approve_<userId>_<points>
    const parts = customId.split('_');
    const userId = parts[2];
    const pointsRequested = parseInt(parts[3], 10);

    // Permission check
    const perms = interaction.memberPermissions;
    if (
      !perms.has(PermissionFlagsBits.ManageGuild) &&
      !perms.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: '❌ You do not have permission to approve claims.',
        ephemeral: true,
      });
    }

    // Fetch user from DB
    const row = await db.getUserById(userId);
    if (!row) {
      return interaction.reply({
        content: '❌ Could not find this user in the database.',
        ephemeral: true,
      });
    }

    // Deduct points
    const updatedPoints = row.points - pointsRequested;
    await db.updateUserPoints(userId, updatedPoints);

    // Build updated embed
    const origEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(origEmbed)
      .setColor('Green')
      .addFields({
        name: 'Status',
        value: `Approved by ${interaction.user}`,
        inline: false
      });

    // Update the message (remove buttons)
    await interaction.update({
      embeds: [updatedEmbed],
      components: []
    });

    // Try to DM the user
    try {
      const user = await client.users.fetch(userId);
      await user.send(
        `✅ Your claim for **${pointsRequested} points** was approved!\n` +
        `Your new balance is **${updatedPoints} points**.`
      );
    } catch {
      // ignore DM errors
    }

    // ────────────────────────────────────────────
    // NEW FEATURE:
    // Remove original staff ping + schedule thread deletion
    // ────────────────────────────────────────────
    try {
      const thread = interaction.channel;

      // Fetch first message (the staff ping)
      const messages = await thread.messages.fetch({ limit: 10 });
      const firstMessage = messages.last(); // oldest message in thread
      
      if (firstMessage && firstMessage.author.id === client.user.id) {
        await firstMessage.edit("🔔 Claim acknowledged and processed.");
      }

      // Schedule auto-delete in 1 minute
      setTimeout(async () => {
        try {
          await thread.delete();
        } catch {
          // thread may already be deleted
        }
      }, 60_000);

    } catch (err) {
      console.error("Error cleaning up claim thread:", err);
    }

  }
};
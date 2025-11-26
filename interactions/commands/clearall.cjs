// interactions/commands/clearall.cjs
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearall')
    .setDescription('Clear ALL player locations (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(client, interaction) {
    // Verify admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ Admins only.',
        ephemeral: true
      });
    }

    const playerLocations = client.playerLocations;
    playerLocations.clear();

    return interaction.reply('🧹 All locations cleared.');
  }
};

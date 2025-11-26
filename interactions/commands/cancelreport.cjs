// interactions/commands/cancelreport.cjs
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cancelreport')
    .setDescription('Cancel your pending roaming Pokémon report'),

  async execute(client, interaction) {
    // Ensure the map exists
    if (!client.pendingReports) {
      client.pendingReports = new Map();
    }

    const pendingReports = client.pendingReports;
    const userId = interaction.user.id;

    if (!pendingReports.has(userId)) {
      return interaction.reply({
        content: '❌ You have **no report** to cancel.',
        ephemeral: true
      });
    }

    // Remove the user's pending report
    pendingReports.delete(userId);

    return interaction.reply({
      content: '🛑 Your report has been cancelled.',
      ephemeral: true
    });
  }
};

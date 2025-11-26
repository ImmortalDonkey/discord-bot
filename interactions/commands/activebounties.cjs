// interactions/commands/activebounties.cjs
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activebounties')
    .setDescription('View all currently active bounties'),

  async execute(client, interaction) {
    return interaction.reply({
      content: "📝 Active bounties will be added soon.",
      ephemeral: true
    });
  }
};

// interactions/commands/clearme.cjs
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearme')
    .setDescription('Mark yourself as inactive (remove your location)'),


  async execute(client, interaction) {
    const user = interaction.user;
    const playerLocations = client.playerLocations;

    playerLocations.delete(user.id);

    return interaction.reply({
      content: '🧹 You were marked inactive.',
      ephemeral: true
    });
  }
};

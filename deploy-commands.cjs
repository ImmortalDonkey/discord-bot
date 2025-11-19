require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  // /setlocation
  new SlashCommandBuilder()
    .setName('setlocation')
    .setDescription('Set your current location')
    .addStringOption(option =>
      option.setName('location')
        .setDescription('Choose your location')
        .setAutocomplete(true)
        .setRequired(true)
    ),

  // /whereami
  new SlashCommandBuilder()
    .setName('whereami')
    .setDescription('Check your current location'),

  // /whereis
  new SlashCommandBuilder()
    .setName('whereis')
    .setDescription('Check another player\'s location')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Select a user')
        .setRequired(true)
    ),

  // /clearme
  new SlashCommandBuilder()
    .setName('clearme')
    .setDescription('Mark yourself as inactive'),

  // /clearall
  new SlashCommandBuilder()
    .setName('clearall')
    .setDescription('[ADMIN] Clears all player locations')
    .setDefaultMemberPermissions(8), // Administrator permission

  // /mypoints
  new SlashCommandBuilder()
    .setName('mypoints')
    .setDescription('Check your total points'),

  // /leaderboard
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View top players leaderboard'),

  // /report
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a roaming Pokémon')
    .addStringOption(option =>
      option.setName('pokemon')
        .setDescription('Name of the Pokémon')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('route')
        .setDescription('Route / location where it was found')
        .setAutocomplete(true)
        .setRequired(true)
    ),

  // /cancelreport
  new SlashCommandBuilder()
    .setName('cancelreport')
    .setDescription('Cancel your pending report')
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🚀 Deploying slash commands...');

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log('✔ Successfully registered all commands.');
  } catch (error) {
    console.error('❌ Failed to deploy commands:', error);
  }
})();

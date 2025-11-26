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
    .setDefaultMemberPermissions(8),

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
    .setDescription('Cancel your pending report'),

  // /claim
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Convert your points into PKD (opens a staff ticket)')
    .addIntegerOption(option =>
      option.setName('points')
        .setDescription('How many points you want to claim')
        .setRequired(true)
    ),

  // /approveclaim
  new SlashCommandBuilder()
    .setName('approveclaim')
    .setDescription('[STAFF] Approve a point claim ticket')
    .setDefaultMemberPermissions(8),

  // /denyclaim
  new SlashCommandBuilder()
    .setName('denyclaim')
    .setDescription('[STAFF] Deny a point claim ticket')
    .setDefaultMemberPermissions(8),

  // 🆕 /bountyrequest WITH:
  // - Start Now OR HH:00
  // - Reward
  // - Notes
  // - Duration
  // - Pokémon1–3
  new SlashCommandBuilder()
    .setName('bountyrequest')
    .setDescription('Submit a new bounty request')

    // REQUIRED
    .addStringOption(o =>
      o.setName('pokemon1')
        .setDescription('Main Pokémon')
        .setAutocomplete(true)
        .setRequired(true)
    )

    .addStringOption(o =>
      o.setName('starttime')
        .setDescription('Start time (or Start Now)')
        .setRequired(true)
        .addChoices(
          { name: 'Start Now', value: 'now' },
          { name: '00:00', value: '00:00' },
          { name: '01:00', value: '01:00' },
          { name: '02:00', value: '02:00' },
          { name: '03:00', value: '03:00' },
          { name: '04:00', value: '04:00' },
          { name: '05:00', value: '05:00' },
          { name: '06:00', value: '06:00' },
          { name: '07:00', value: '07:00' },
          { name: '08:00', value: '08:00' },
          { name: '09:00', value: '09:00' },
          { name: '10:00', value: '10:00' },
          { name: '11:00', value: '11:00' },
          { name: '12:00', value: '12:00' },
          { name: '13:00', value: '13:00' },
          { name: '14:00', value: '14:00' },
          { name: '15:00', value: '15:00' },
          { name: '16:00', value: '16:00' },
          { name: '17:00', value: '17:00' },
          { name: '18:00', value: '18:00' },
          { name: '19:00', value: '19:00' },
          { name: '20:00', value: '20:00' },
          { name: '21:00', value: '21:00' },
          { name: '22:00', value: '22:00' },
          { name: '23:00', value: '23:00' }
        )
    )

    .addIntegerOption(o =>
      o.setName('duration')
        .setDescription('How long the bounty runs for')
        .setRequired(true)
        .addChoices(
          { name: '1 hour', value: 1 },
          { name: '2 hours', value: 2 },
          { name: '3 hours', value: 3 },
          { name: '4 hours', value: 4 },
          { name: '5 hours', value: 5 },
          { name: '6 hours', value: 6 },
          { name: '12 hours', value: 12 },
          { name: '24 hours', value: 24 },
          { name: '48 hours', value: 48 },
          { name: '72 hours', value: 72 }
        )
    )

    .addIntegerOption(o =>
      o.setName('reward')
        .setDescription('Reward amount (pkd)')
        .setRequired(true)
    )

    .addStringOption(o =>
      o.setName('notes')
        .setDescription('Required note/message')
        .setRequired(true)
    )

    // OPTIONAL
    .addStringOption(o =>
      o.setName('pokemon2')
        .setDescription('Optional second Pokémon')
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName('pokemon3')
        .setDescription('Optional third Pokémon')
        .setAutocomplete(true)
        .setRequired(false)
    ),

  // 🆕 NEW: /activebounties
  new SlashCommandBuilder()
    .setName('activebounties')
    .setDescription('View all currently active bounties'),

  // 🆕 NEW: /activeroutes
  new SlashCommandBuilder()
    .setName('activeroutes')
    .setDescription('View all routes with active sightings')
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

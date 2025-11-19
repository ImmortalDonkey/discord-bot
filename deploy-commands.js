require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const commands = [
  {
    name: 'report',
    description: 'Report a roaming Pokémon',
    options: [
      {
        name: 'pokemon',
        description: 'Select the Pokémon',
        type: 3, // STRING
        required: true,
        autocomplete: true
      },
      {
        name: 'route',
        description: 'Choose the location or route',
        type: 3, // STRING
        required: true,
        autocomplete: true
      },
      {
        name: 'cancel',
        description: 'Cancel this report instead',
        type: 5, // BOOLEAN
        required: false
      }
    ]
  },
  {
    name: 'mypoints',
    description: 'Check your roaming points'
  },
  {
    name: 'leaderboard',
    description: 'View the top hunters'
  },
  {
    name: 'setlocation',
    description: 'Set your current location',
    options: [
      {
        name: 'location',
        description: 'Choose your current location',
        type: 3, // STRING
        required: true,
        autocomplete: true
      }
    ]
  },
  {
    name: 'whereami',
    description: 'Check your current location'
  },
  {
    name: 'whereis',
    description: 'Check another player’s location',
    options: [
      {
        name: 'user',
        description: 'Select a user',
        type: 6, // USER
        required: true
      }
    ]
  },
  {
    name: 'locations',
    description: 'View all currently active player locations'
  },
  {
    name: 'clearme',
    description: 'Mark yourself as inactive'
  },
  {
    name: 'clearall',
    description: 'Admin only: Clear all player location data',
    default_member_permissions: '0', // no permissions by default, restricted in code
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🔄 Deploying ${commands.length} slash commands...`);

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log('✅ Commands deployed successfully!');
  } catch (error) {
    console.error('❌ Deployment failed:', error);
  }
})();

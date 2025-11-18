require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const commands = [
  {
    name: 'setlocation',
    description: 'Set your current location',
    options: [
      {
        name: 'location',
        description: 'Choose your current location',
        type: 3, // STRING
        required: true,
        autocomplete: true // 🔹 Enable autocomplete
      }
    ]
  },
  { name: 'whereami', description: 'Check your current location' },
  {
    name: 'whereis',
    description: 'Check another player\'s location',
    options: [
      {
        name: 'user',
        description: 'Select a user',
        type: 6, // USER
        required: true
      }
    ]
  },
  { name: 'locations', description: 'View active player locations' },
  { name: 'clearme', description: 'Mark yourself inactive' },
  { name: 'clearall', description: 'Admin: clear all locations', default_permission: false },
  { name: 'mypoints', description: 'Check your roaming points' },
  { name: 'leaderboard', description: 'View top hunters' }
];

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🔄 Deploying ${commands.length} commands...`);

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, '1435654694319030302'),
      { body: commands }
    );

    console.log('✅ Commands deployed successfully!');
  } catch (err) {
    console.error('❌ Deployment failed:', err);
  }
})();

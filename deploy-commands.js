// ===== Slash Command Deployment for v13 =====
require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// Slash commands for v13 (same as v14)
const commands = [
  {
    name: 'setlocation',
    description: 'Set your current location',
    options: [
      {
        name: 'location',
        description: 'Choose your current location',
        type: 3, // STRING
        required: true
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
        description: 'The user to check',
        type: 6, // USER
        required: true
      }
    ]
  },
  { name: 'locations', description: 'View all active player locations' },
  { name: 'clearme', description: 'Mark yourself as inactive' },
  {
    name: 'clearall',
    description: 'Clear all player locations (Admin only)',
    default_permission: false
  },
  { name: 'mypoints', description: 'Check your roaming points' },
  { name: 'leaderboard', description: 'View the top hunters' }
];

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = '1435654694319030302';

const rest = new REST({ version: '9' }).setToken(token);

(async () => {
  try {
    console.log(`🔄 Deploying ${commands.length} commands...`);

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log("✅ Commands deployed!");
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();

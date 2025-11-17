// deploy-commands.js (v13-compatible)
require('dotenv').config();

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { ApplicationCommandOptionType, PermissionFlagsBits } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID || '1435654694319030302';

if (!token || !clientId) {
  console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

const commands = [
  {
    name: 'setlocation',
    description: 'Set your current location',
    options: [
      {
        name: 'location',
        description: 'Choose your current location',
        type: ApplicationCommandOptionType.STRING,
        required: true,
        autocomplete: true
      }
    ]
  },
  { name: 'whereami', description: 'Check your current location' },
  {
    name: 'whereis',
    description: "Check another player's location",
    options: [
      {
        name: 'user',
        description: 'The user to check',
        type: ApplicationCommandOptionType.USER,
        required: true
      }
    ]
  },
  { name: 'locations', description: 'View all active player locations' },
  { name: 'clearme', description: 'Mark yourself as inactive' },
  {
    name: 'clearall',
    description: 'Clear all player locations (Admin only)',
    default_member_permissions: `${PermissionFlagsBits.ADMINISTRATOR}`
  },
  { name: 'mypoints', description: 'Check your current roaming points and PKD value' },
  { name: 'leaderboard', description: 'View the top 10 hunters by points' }
];

(async () => {
  const rest = new REST({ version: '9' }).setToken(token);
  try {
    console.log(`🔄 Deploying ${commands.length} commands to guild ${guildId}...`);
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log(`✅ Successfully reloaded ${data.length} guild (/) commands.`);
  } catch (err) {
    console.error('❌ Error deploying commands:', err);
  }
})();

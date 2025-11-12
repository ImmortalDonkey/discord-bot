// ===== Discord Slash Command Deployment =====
const { REST, Routes, ApplicationCommandOptionType, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

// === All Commands ===
const commands = [
    // --- Location Commands ---
    {
        name: 'setlocation',
        description: 'Set your current location',
        options: [
            {
                name: 'location',
                description: 'Choose your current location',
                type: ApplicationCommandOptionType.String,
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
        description: 'Check another player\'s location',
        options: [
            {
                name: 'user',
                description: 'The user to check',
                type: ApplicationCommandOptionType.User,
                required: true
            }
        ]
    },
    {
        name: 'locations',
        description: 'View all active player locations'
    },
    {
        name: 'clearme',
        description: 'Mark yourself as inactive'
    },
    {
        name: 'clearall',
        description: 'Clear all player locations (Admin only)',
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },

    // --- Points System Commands ---
    {
        name: 'mypoints',
        description: 'Check your current roaming points and PKD value'
    },
    {
        name: 'leaderboard',
        description: 'View the top 10 hunters by points'
    }
];

// === Environment Variables ===
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = '1435654694319030302'; // Your Guild ID

if (!token || !clientId) {
    console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID in .env file!');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

// === Deploy Commands to Guild ===
(async () => {
    try {
        console.log(`🔄 Deploying ${commands.length} commands to guild: ${guildId}`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );

        console.log(`✅ Successfully reloaded ${data.length} guild (/) commands.`);
        console.log('\nRegistered commands:');
        data.forEach(cmd => console.log(`  - /${cmd.name}: ${cmd.description}`));
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();

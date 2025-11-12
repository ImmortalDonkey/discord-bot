// deploy-commands.js
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// === Slash Commands ===
const commands = [
    // --- Location Commands ---
    new SlashCommandBuilder()
        .setName('setlocation')
        .setDescription('Set your current location in the game')
        .addStringOption(option =>
            option
                .setName('location')
                .setDescription('Type to search for your location')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    new SlashCommandBuilder()
        .setName('whereami')
        .setDescription('Check your current location'),

    new SlashCommandBuilder()
        .setName('whereis')
        .setDescription('Check where another player is located')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The player to check')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('locations')
        .setDescription('List all tracked player locations'),

    new SlashCommandBuilder()
        .setName('clearme')
        .setDescription('Remove yourself from location tracking (mark as inactive)'),

    new SlashCommandBuilder()
        .setName('clearall')
        .setDescription('[ADMIN] Clear all player location data')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // --- Points System Commands ---
    new SlashCommandBuilder()
        .setName('mypoints')
        .setDescription('Show your current points and PKD value'),

    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the top point holders')
].map(command => command.toJSON());

// === Deployment Setup ===
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
    console.error('❌ ERROR: Missing required environment variables!');
    console.error('Please set: DISCORD_TOKEN and CLIENT_ID');
    console.error('Optional: GUILD_ID (for faster guild-only deployment)');
    process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

        let data;
        if (guildId) {
            console.log(`📍 Deploying to specific guild: ${guildId}`);
            data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
        } else {
            console.log('🌍 Deploying globally (this may take up to 1 hour to propagate)');
            data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
        }

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        console.log('\nCommands registered:');
        data.forEach(cmd => console.log(`  - /${cmd.name}: ${cmd.description}`));
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();

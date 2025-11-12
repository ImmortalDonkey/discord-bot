// ----- Discord.js Setup -----
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const express = require("express");
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library'); // ✅ Required for new API
const app = express();

// ----- Discord Client -----
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ----- Player Data -----
const playerLocations = new Map();

const availableLocations = [
    'Route 1', 'Route 2', 'Route 3', 'Route 4', 'Route 6', 'Route 7',
    'Route 8', 'Route 9', 'Route 10', 'Route 11', 'Route 12', 'Route 13',
    'Route 14', 'Route 15', 'Route 16', 'Route 17', 'Route 18', 'Route 19',
    'Route 20', 'Route 21', 'Route 22', 'Route 23', 'Route 24', 'Route 25',
    'Mudbray Ranch', 'New Haven', 'Nightshade', 'Shore\'s End',
    'Stillwater Quarry', 'Wild Overgrowth'
];

// ----- Google Sheets Setup -----
const SHEET_ID = '17L4nw5CIw0s0_YomuJiCwSB592Nf9-IRVJ2zogpCEwc';
let sheet; // global sheet reference

async function initGoogleSheet() {
    try {
        // Load service account credentials from environment variable
        const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

        // Create authentication client using new JWT method
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        // Create GoogleSpreadsheet instance using auth client
        const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();

        sheet = doc.sheetsByIndex[0];
        console.log(`📄 Connected to Google Sheet: ${doc.title}`);
    } catch (error) {
        console.error('❌ Failed to connect to Google Sheets:', error);
    }
}

// ----- Bot Ready Event -----
client.once('clientReady', async () => {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    console.log(`📍 Location tracking system initialized`);
    console.log(`📋 ${availableLocations.length} locations available`);

    await initGoogleSheet();
});

// ----- Command Handling -----
client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'setlocation') {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const filtered = availableLocations.filter(location =>
                location.toLowerCase().includes(focusedValue)
            );

            const options = filtered.slice(0, 25).map(location => ({
                name: location,
                value: location
            }));

            await interaction.respond(options);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === 'setlocation') {
            const location = interaction.options.getString('location');
            const userId = interaction.user.id;
            const username = interaction.user.username;

            playerLocations.set(userId, {
                location: location,
                username: username,
                timestamp: new Date()
            });

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('📍 Location Updated')
                .setDescription(`Your location has been set to: **${location}**`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // ✅ Log to Google Sheets
            if (sheet) {
                try {
                    await sheet.addRow({
                        Username: username,
                        UserID: userId,
                        Location: location,
                        Timestamp: new Date().toLocaleString()
                    });
                    console.log(`📊 Logged ${username}'s location to Google Sheets.`);
                } catch (err) {
                    console.error("⚠️ Failed to log to Google Sheets:", err);
                }
            }

        } else if (commandName === 'whereami') {
            const userId = interaction.user.id;
            const playerData = playerLocations.get(userId);

            if (!playerData) {
                await interaction.reply({
                    content: '❌ You haven\'t set your location yet. Use `/setlocation` to set it!',
                    ephemeral: true
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📍 Your Location')
                .addFields(
                    { name: 'Current Location', value: playerData.location, inline: true },
                    { name: 'Last Updated', value: playerData.timestamp.toLocaleString(), inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } else if (commandName === 'whereis') {
            const targetUser = interaction.options.getUser('user');
            const playerData = playerLocations.get(targetUser.id);

            if (!playerData) {
                await interaction.reply({
                    content: `❌ ${targetUser.username} hasn't set their location yet.`,
                    ephemeral: true
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`📍 ${targetUser.username}'s Location`)
                .addFields(
                    { name: 'Current Location', value: playerData.location, inline: true },
                    { name: 'Last Updated', value: playerData.timestamp.toLocaleString(), inline: true }
                )
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } else if (commandName === 'locations') {
            if (playerLocations.size === 0) {
                await interaction.reply({
                    content: '❌ No players have set their locations yet.',
                    ephemeral: true
                });
                return;
            }

            let locationList = '';
            playerLocations.forEach((data) => {
                locationList += `**${data.username}**: ${data.location}\n`;
            });

            const embed = new EmbedBuilder()
                .setColor(0xFFAA00)
                .setTitle('🗺️ All Player Locations')
                .setDescription(locationList)
                .setFooter({ text: `Total players tracked: ${playerLocations.size}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } else if (commandName === 'clearme') {
            const userId = interaction.user.id;
            const playerData = playerLocations.get(userId);

            if (!playerData) {
                await interaction.reply({
                    content: '❌ You don\'t have an active location set.',
                    ephemeral: true
                });
                return;
            }

            playerLocations.delete(userId);

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🚫 Location Cleared')
                .setDescription('You have been marked as inactive and removed from location tracking.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } else if (commandName === 'clearall') {
            if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({
                    content: '❌ You need Administrator permissions to use this command.',
                    ephemeral: true
                });
                return;
            }

            const playerCount = playerLocations.size;
            playerLocations.clear();

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🗑️ All Location Data Cleared')
                .setDescription(`Removed location data for **${playerCount}** player(s).`)
                .setFooter({ text: `Cleared by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            console.log(`🗑️ Admin ${interaction.user.username} cleared all location data (${playerCount} entries)`);
        }

    } catch (error) {
        console.error('Error handling command:', error);
        const errorMessage = {
            content: '❌ There was an error executing this command!',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// ----- Login -----
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('❌ ERROR: DISCORD_TOKEN not found in environment variables!');
    process.exit(1);
}

client.login(token);

// ----- Keep-Alive Web Server (Render + UptimeRobot) -----
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(3000, () => console.log("🌐 Keep-alive web server running on port 3000"));

// ----- Auto Self-Ping to Keep Alive -----
const KEEP_ALIVE_URL = "https://discord-bot-146j.onrender.com";
setInterval(() => {
    fetch(KEEP_ALIVE_URL)
        .then(res => console.log(`🔄 Self-ping successful: ${res.status}`))
        .catch(err => console.error("⚠️ Self-ping failed:", err));
}, 5 * 60 * 1000); // every 5 minutes

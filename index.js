// index.js (v13-compatible)
require('dotenv').config();

const { Client, Intents, MessageEmbed, Permissions } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch'); // v2
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const db = require('./database');

const app = express();

// ----- Discord Client -----
const client = new Client({
  ws: { intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.MESSAGE_CONTENT // NOTE: MESSAGE_CONTENT intent in v13 may require privileged intent enabled
  ] }
});

// ----- In-memory locations -----
const playerLocations = new Map();

const availableLocations = [
  "Route 1", "Route 2", "Route 3", "Route 4", "Route 6", "Route 7",
  "Route 8", "Route 9", "Route 10", "Route 11", "Route 12", "Route 13",
  "Route 14", "Route 15", "Route 16", "Route 17", "Route 18", "Route 19",
  "Route 20", "Route 21", "Route 22", "Route 23", "Route 24", "Route 25",
  "Mudbray Ranch", "New Haven", "Nightshade", "Shore's End",
  "Stillwater Quarry", "Wild Overgrowth"
];

// ----- Rarity groups & points -----
const rarityGroups = {
  paradox: [
    "Walking Wake", "Gouging Fire", "Raging Bolt",
    "Iron Leaves", "Iron Boulder", "Iron Crown"
  ],
  roamerMonth: [
    "Clone Venusaur", "Clone Charizard", "Clone Blastoise",
    "Ancient Jigglypuff", "Ancient Alakazam", "Ancient Gengar",
    "Crystal Onix", "Pink Rhyhorn", "Snorlax (Snowman)",
    "Mewtwo (Shadow)", "Golden Sudowoodo", "XD001", "Reddy",
    "Meta Groudon", "Rayquaza (Illusion)", "Dialga (Primal)", "Z2"
  ],
  legendary: [
    "Raikou", "Entei", "Suicune", "Latias", "Latios",
    "Glastrier", "Spectrier", "Koraidon", "Miraidon"
  ],
  rare: ["Cyclizar", "Gimmighoul (Roaming)"],
  common: ["Zygarde (Cell)", "Bramblin", "Bombirdier", "Varoom"]
};

const rarityPoints = {
  paradox: 200,
  roamerMonth: 30,
  legendary: 20,
  rare: 20,
  common: 1
};

// ----- Google Sheets setup -----
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '17L4nw5CIw0s0_YomuJiCwSB592Nf9-IRVJ2zogpCEwc';
let sheetDoc = null;
let sheet = null;

async function initGoogleSheet() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.warn('⚠️ GOOGLE_SERVICE_ACCOUNT not provided — Sheets disabled.');
    return;
  }
  try {
    const creds = typeof process.env.GOOGLE_SERVICE_ACCOUNT === 'string'
      ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)
      : process.env.GOOGLE_SERVICE_ACCOUNT;

    const serviceAccountAuth = new JWT({
      email: creds.client_email,
      key: creds.private_key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    sheetDoc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await sheetDoc.loadInfo();
    sheet = sheetDoc.sheetsByIndex[0];
    console.log('📄 Connected to Google Sheet:', sheet.title);

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues || [];
    const desired = ['Username', 'DiscordID', 'Points', 'LastUpdated'];
    if (!desired.every(h => headers.includes(h))) {
      await sheet.setHeaderRow(desired);
    }
  } catch (err) {
    console.error('❌ Failed to initialize Google Sheet:', err);
    sheet = null;
    sheetDoc = null;
  }
}

// ---- SQLite init ----
(async () => {
  try {
    await db.init();
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ DB init failed:', err);
  }
})();

function getRarityPoints(pokemonName) {
  const group = Object.keys(rarityGroups).find(g =>
    rarityGroups[g].some(p => String(p).toLowerCase() === String(pokemonName).toLowerCase())
  );
  if (group) return rarityPoints[group] || 10;
  return 10;
}

async function awardPoints(discordId, username, pointsToAdd, reason = '') {
  try {
    const res = await db.addPoints(discordId, username, pointsToAdd, reason);
    return res;
  } catch (err) {
    console.error('❌ Failed to award points:', err);
    throw err;
  }
}

const VORTEX_ID = process.env.VORTEX_ID || '858945228655951882';

client.on('messageCreate', async (message) => {
  try {
    if (!message || !message.author) return;
    if (message.author.id !== VORTEX_ID) return;

    const content =
      message.content ||
      (message.embeds && message.embeds[0] && message.embeds[0].description) ||
      (message.embeds && message.embeds[0] && message.embeds[0].title) ||
      '';

    if (!content) return;

    const match = content.match(/report for (.+?) in (.+?), it will expire/i);
    if (!match) return;

    const pokemon = match[1];
    const location = match[2];

    const reporterUser = (message.interaction && message.interaction.user) || (message.mentions && message.mentions.users && message.mentions.users.first && message.mentions.users.first());
    const points = getRarityPoints(pokemon);

    if (reporterUser) {
      await awardPoints(reporterUser.id, reporterUser.username, points, `Vortex report: ${pokemon} @ ${location}`);
      await message.channel.send(`🧭 Detected a **${pokemon}** report in **${location}**! +${points} points to ${reporterUser.username}.`);
    } else {
      await message.channel.send(`🧭 Detected a **${pokemon}** report in **${location}**! (Reporter unknown — not credited)`);
    }
  } catch (err) {
    console.error('❌ Error handling Vortex message:', err);
  }
});

client.on('messageUpdate', async (_, newMsg) => {
  try {
    if (newMsg) client.emit('messageCreate', newMsg);
  } catch (err) {
    console.error('❌ Error forwarding messageUpdate:', err);
  }
});

// Interaction handling (slash commands + autocomplete)
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete && interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();
      const filtered = availableLocations
        .filter(l => l.toLowerCase().includes(String(focused).toLowerCase()))
        .slice(0, 25);
      await interaction.respond(filtered.map(l => ({ name: l, value: l })));
      return;
    }

    if (!interaction.isCommand || !interaction.isCommand()) return;
    const commandName = interaction.commandName;

    if (commandName === 'setlocation') {
      const location = interaction.options.getString('location');
      const userId = interaction.user.id;
      const username = interaction.user.username;
      playerLocations.set(userId, { location, username, timestamp: new Date() });

      const embed = new MessageEmbed()
        .setColor('#00FF00')
        .setTitle('📍 Location Updated')
        .setDescription(`Your location has been set to: **${location}**`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === 'whereami') {
      const data = playerLocations.get(interaction.user.id);
      if (!data) return interaction.reply({ content: "❌ You haven't set your location yet!", ephemeral: true });

      const embed = new MessageEmbed()
        .setColor('#0099FF')
        .setTitle('📍 Your Location')
        .addField('Current Location', data.location, true)
        .addField('Last Updated', data.timestamp.toLocaleString(), true);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === 'whereis') {
      const user = interaction.options.getUser('user');
      const data = playerLocations.get(user.id);
      if (!data) return interaction.reply({ content: `❌ ${user.username} hasn't set a location yet!`, ephemeral: true });

      const embed = new MessageEmbed()
        .setColor('#FF9900')
        .setTitle(`📍 ${user.username}'s Location`)
        .addField('Location', data.location, true)
        .addField('Last Updated', data.timestamp.toLocaleString(), true);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === 'locations') {
      if (playerLocations.size === 0) return interaction.reply({ content: '❌ No active players have set a location.', ephemeral: true });

      let desc = '';
      for (const [, data] of playerLocations) desc += `**${data.username}** — ${data.location}\n`;

      const embed = new MessageEmbed()
        .setColor('#33CCFF')
        .setTitle('🌍 Active Player Locations')
        .setDescription(desc)
        .setFooter(`${playerLocations.size} active players`);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === 'clearme') {
      const userId = interaction.user.id;
      if (playerLocations.has(userId)) {
        playerLocations.delete(userId);
        await interaction.reply({ content: '✅ You have been marked as inactive.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ You are not currently active.', ephemeral: true });
      }
      return;
    }

    if (commandName === 'clearall') {
      // permission check: v13
      if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR))
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });

      playerLocations.clear();
      await interaction.reply('🧹 All player location data has been reset!');
      return;
    }

    if (commandName === 'mypoints') {
      try {
        const discordId = interaction.user.id;
        let row = await db.getUserById(discordId);
        if (!row) row = await db.getUserByUsername(interaction.user.username);

        const points = row ? parseInt(row.points || 0) : 0;
        const value = points * 200000;

        const embed = new MessageEmbed()
          .setColor('#FFD700')
          .setTitle('💰 Your Points')
          .addField('Total Points', `${points.toLocaleString()} pts`, true)
          .addField('PKD Value', `${value.toLocaleString()} pkd`, true)
          .setFooter('1 point = 200,000 pkd');

        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch (err) {
        console.error('❌ /mypoints error:', err);
        await interaction.reply({ content: '⚠️ Error retrieving your points.', ephemeral: true });
      }
      return;
    }

    if (commandName === 'leaderboard') {
      try {
        const rows = await db.getLeaderboard(10);
        if (!rows || rows.length === 0) return interaction.reply({ content: '⚠️ No point data available yet.', ephemeral: true });

        let desc = '';
        rows.forEach((u, i) => {
          const name = u.username || 'Unknown';
          desc += `**#${i + 1}** 🏅 ${name} — ${u.points} pts (${(u.points * 200000).toLocaleString()} PKD)\n`;
        });

        const embed = new MessageEmbed()
          .setColor('#FFD700')
          .setTitle('🏆 Roaming Points Leaderboard')
          .setDescription(desc)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        console.error('❌ /leaderboard error:', err);
        await interaction.reply({ content: '⚠️ Error generating leaderboard.', ephemeral: true });
      }
      return;
    }
  } catch (err) {
    console.error('❌ Error in interaction handler:', err);
    try { if (!interaction.replied) await interaction.reply({ content: '⚠️ Error executing command.', ephemeral: true }); } catch(e){}
  }
});

// ---- Google Sheets sync (hourly) ----
function msUntilNextHour() {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(now.getHours() + 1);
  return next - now;
}

async function syncSqliteToSheets() {
  if (!sheet) {
    console.warn('⚠️ Sheets not configured; skipping hourly sync.');
    return;
  }

  try {
    const rows = await db.getAllUsers();
    const values = rows.map(r => ({
      Username: r.username || '',
      DiscordID: r.discord_id || '',
      Points: r.points != null ? String(r.points) : '0',
      LastUpdated: r.last_updated ? new Date(r.last_updated).toISOString() : ''
    }));

    await sheet.clear();
    await sheet.setHeaderRow(['Username', 'DiscordID', 'Points', 'LastUpdated']);
    if (values.length) await sheet.addRows(values);

    console.log(`✅ Synced ${values.length} rows to Google Sheets at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('❌ Failed to sync to Google Sheets:', err);
  }
}

function scheduleHourlySync() {
  const first = msUntilNextHour();
  console.log(`⏱ Hourly sync will start in ${Math.round(first / 1000)}s, then every 1 hour.`);
  setTimeout(() => {
    syncSqliteToSheets().catch(e => console.error(e));
    setInterval(() => syncSqliteToSheets().catch(e => console.error(e)), 60 * 60 * 1000);
  }, first);
}

// ----- ready & login -----
client.once('ready', async () => {
  console.log(`✅ Bot ready as ${client.user.tag}`);
  await initGoogleSheet();
  scheduleHourlySync();
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ Missing DISCORD_TOKEN in environment variables!');
  process.exit(1);
}
client.login(token);

// optional small web server
app.get('/', (req, res) => res.send('Bot (SQLite) is running'));
const webPort = process.env.WEB_PORT || 3000;
app.listen(webPort, () => console.log(`🌐 Web server listening on ${webPort}`));

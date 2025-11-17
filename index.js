// index.js (Discord.js v13 compatible)
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { Client, Intents, MessageEmbed, Permissions } = require('discord.js');

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const db = require('./database');
const app = express();

// ----- Discord Client (v13 syntax) -----
const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS, 
    Intents.FLAGS.GUILD_MESSAGES
  ]
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

// ----- Rarity groups -----
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

// ----- Google Sheets Setup -----
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
let sheetDoc = null;
let sheet = null;

async function initGoogleSheet() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.log("⚠ Sheets disabled.");
    return;
  }

  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

    const serviceAuth = new JWT({
      email: creds.client_email,
      key: creds.private_key.replace(/\\n/g, "\n"),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    sheetDoc = new GoogleSpreadsheet(SHEET_ID, serviceAuth);
    await sheetDoc.loadInfo();
    sheet = sheetDoc.sheetsByIndex[0];
    console.log("📄 Connected to Google Sheet:", sheet.title);

    await sheet.loadHeaderRow();
    if (!sheet.headerValues.includes("Username")) {
      await sheet.setHeaderRow(['Username', 'DiscordID', 'Points', 'LastUpdated']);
    }

  } catch (err) {
    console.error("❌ Sheets init failed:", err);
  }
}

// ----- DB Init -----
(async () => {
  try {
    await db.init();
    console.log("✅ Database OK");
  } catch (err) {
    console.error("❌ DB error:", err);
  }
})();

// ----- Point calculation -----
function getRarityPoints(pokemon) {
  const key = Object.keys(rarityGroups).find(k =>
    rarityGroups[k].some(p => p.toLowerCase() === pokemon.toLowerCase())
  );
  return key ? (rarityPoints[key] || 10) : 10;
}

// Award points helper
async function awardPoints(discordId, username, points, reason = "") {
  return await db.addPoints(discordId, username, points, reason);
}

// ----- Vortex Message Detection -----
const VORTEX_ID = process.env.VORTEX_ID || "858945228655951882";

client.on("messageCreate", async message => {
  try {
    if (message.author.id !== VORTEX_ID) return;

    const text =
      message.content ||
      message.embeds?.[0]?.description ||
      message.embeds?.[0]?.title ||
      "";

    const match = text.match(/report for (.+?) in (.+?), it will expire/i);
    if (!match) return;

    const pokemon = match[1];
    const location = match[2];
    const reporter = message.mentions.users.first();

    const pts = getRarityPoints(pokemon);

    if (reporter) {
      await awardPoints(reporter.id, reporter.username, pts, `Vortex: ${pokemon} @ ${location}`);
      message.channel.send(
        `🧭 **${pokemon}** spotted in **${location}** — +${pts} points to **${reporter.username}**`
      );
    } else {
      message.channel.send(`🧭 **${pokemon}** at **${location}** (Reporter unknown)`);
    }

  } catch (err) {
    console.error("❌ Vortex error:", err);
  }
});

// ----- Slash Command Handling (v13) -----
client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;

    // ====== setlocation ======
    if (commandName === "setlocation") {
      const loc = interaction.options.getString("location");
      playerLocations.set(interaction.user.id, {
        location: loc,
        username: interaction.user.username,
        timestamp: new Date()
      });

      const embed = new MessageEmbed()
        .setColor("GREEN")
        .setTitle("📍 Location Updated")
        .setDescription(`Your location is now **${loc}**`)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ====== whereami ======
    if (commandName === "whereami") {
      const data = playerLocations.get(interaction.user.id);
      if (!data)
        return interaction.reply({ content: "❌ You haven't set a location!", ephemeral: true });

      const embed = new MessageEmbed()
        .setColor("BLUE")
        .setTitle("📍 Your Location")
        .addField("Location", data.location)
        .addField("Updated", data.timestamp.toLocaleString());

      return interaction.reply({ embeds: [embed] });
    }

    // ====== whereis ======
    if (commandName === "whereis") {
      const user = interaction.options.getUser("user");
      const data = playerLocations.get(user.id);
      if (!data)
        return interaction.reply({ content: "❌ They haven't set a location!", ephemeral: true });

      const embed = new MessageEmbed()
        .setColor("ORANGE")
        .setTitle(`📍 ${user.username}'s Location`)
        .addField("Location", data.location)
        .addField("Updated", data.timestamp.toLocaleString());

      return interaction.reply({ embeds: [embed] });
    }

    // ====== locations ======
    if (commandName === "locations") {
      if (playerLocations.size === 0)
        return interaction.reply({ content: "❌ No active locations.", ephemeral: true });

      let text = "";
      playerLocations.forEach(v => {
        text += `**${v.username}** — ${v.location}\n`;
      });

      const embed = new MessageEmbed()
        .setColor("CYAN")
        .setTitle("🌍 Active Player Locations")
        .setDescription(text);

      return interaction.reply({ embeds: [embed] });
    }

    // ====== clearme ======
    if (commandName === "clearme") {
      playerLocations.delete(interaction.user.id);
      return interaction.reply({ content: "✅ You were marked inactive.", ephemeral: true });
    }

    // ====== clearall ======
    if (commandName === "clearall") {
      if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR))
        return interaction.reply({ content: "❌ Admins only.", ephemeral: true });

      playerLocations.clear();
      return interaction.reply("🧹 All locations cleared.");
    }

    // ====== mypoints ======
    if (commandName === "mypoints") {
      const row = await db.getUserById(interaction.user.id);
      const pts = row ? row.points : 0;
      const value = pts * 200000;

      const embed = new MessageEmbed()
        .setColor("GOLD")
        .setTitle("💰 Your Points")
        .addField("Total Points", String(pts))
        .addField("PKD Value", value.toLocaleString() + " pkd");

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ====== leaderboard ======
    if (commandName === "leaderboard") {
      const rows = await db.getLeaderboard(10);
      if (rows.length === 0)
        return interaction.reply({ content: "No data yet.", ephemeral: true });

      let desc = "";
      rows.forEach((u, i) => {
        desc += `**#${i + 1}** — ${u.username} — ${u.points} pts\n`;
      });

      const embed = new MessageEmbed()
        .setColor("GOLD")
        .setTitle("🏆 Top Hunters")
        .setDescription(desc);

      return interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error("❌ Command error:", err);
  }
});

// ----- Ready -----
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await initGoogleSheet();
});

// ----- Login -----
client.login(process.env.DISCORD_TOKEN);

// ----- Web server -----
app.get("/", (req, res) => res.send("Bot running on Pi (v13)"));
app.listen(3000, () => console.log("🌐 Web server on 3000"));

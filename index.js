require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require('discord.js');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const db = require('./database');

const app = express();

// ==========================
//  Discord Client (v14)
// ==========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ==========================
//  In-memory Data
// ==========================
const pendingReports = new Map();

const availableLocations = [
  "Route 1", "Route 2", "Route 3", "Route 4", "Route 6", "Route 7",
  "Route 8", "Route 9", "Route 10", "Route 11", "Route 12", "Route 13",
  "Route 14", "Route 15", "Route 16", "Route 17", "Route 18", "Route 19",
  "Route 20", "Route 21", "Route 22", "Route 23", "Route 24", "Route 25",
  "Mudbray Ranch", "New Haven", "Nightshade", "Shore's End",
  "Stillwater Quarry", "Wild Overgrowth",
];

const rarityGroups = {
  ROAMERMONTH: ["Clone Venusaur", "Clone Charizard", "Clone Blastoise", "Ancient Jigglypuff", "Ancient Alakazam", "Ancient Gengar", "Crystal Onix", "Pink Rhyhorn", "Snorlax (Snowman)", "Mewtwo (Shadow)", "Golden Sudowoodo", "XD001", "Reddy", "Meta Groudon", "Rayquaza (Illusion)", "Dialga (Primal)", "Z2"],
  PARADOX: ["Walking Wake", "Gouging Fire", "Raging Bolt", "Iron Leaves", "Iron Boulder", "Iron Crown"],
  LEGENDARY: ["Raikou", "Entei", "Suicune", "Latias", "Latios", "Glastrier", "Spectrier", "Koraidon", "Miraidon"],
  RARE: ["Cyclizar", "Gimmighoul (Roaming)"],
  COMMON: ["Zygarde (Cell)", "Bramblin", "Bombirdier", "Varoom"],
};

const rarityPoints = {
  ROAMERMONTH: 30,
  PARADOX: 200,
  LEGENDARY: 20,
  RARE: 20,
  COMMON: 1,
};

// ==========================
//  Google Sheets Setup
// ==========================
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
      key: creds.private_key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAuth);
    await doc.loadInfo();
    sheet = doc.sheetsByIndex[0];
    console.log(`📄 Connected to Sheet: ${sheet.title}`);
  } catch (err) {
    console.error("❌ Sheets setup failed:", err);
  }
}

// ==========================
//  Helper Functions
// ==========================
async function awardPoints(id, username, pts, reason = "") {
  return await db.addPoints(id, username, pts, reason);
}

function getRarity(pokemon) {
  return (
    Object.keys(rarityGroups).find((r) =>
      rarityGroups[r].some(
        (p) => p.toLowerCase() === pokemon.toLowerCase()
      )
    ) || "COMMON"
  );
}

// ==========================
//  Interaction Handling
// ==========================
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();
      const option = interaction.options.getFocused(true).name;
      let choices =
        option === "pokemon"
          ? Object.values(rarityGroups).flat()
          : availableLocations;

      const filtered = choices
        .filter((c) => c.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25);

      return interaction.respond(
        filtered.map((c) => ({ name: c, value: c }))
      );
    }

    if (!interaction.isCommand()) return;
    const { commandName } = interaction;

    // ==========================
    //  /report Command
    // ==========================
    if (commandName === "report") {
      const pokemon = interaction.options.getString("pokemon");
      const route = interaction.options.getString("route");
      const cancel = interaction.options.getBoolean("cancel") || false;

      if (cancel) {
        pendingReports.delete(interaction.user.id);
        return interaction.reply({
          content: "🛑 Report cancelled.",
          ephemeral: true,
        });
      }

      const rarity = getRarity(pokemon).toUpperCase();
      const roleId = process.env[`ROLE_${rarity}`];
      const channelId = process.env[`CHANNEL_${rarity}`];

      if (!roleId || !channelId) {
        return interaction.reply({
          content: "⚠ Server configuration is missing for this rarity group.",
          ephemeral: true,
        });
      }

      pendingReports.set(interaction.user.id, { pokemon, route });

      // If submitted in wrong channel
      if (interaction.channel.id !== channelId) {
        await interaction.reply({
          content: `⚠ Wrong channel! This will be posted in <#${channelId}>.`,
          ephemeral: true,
        });
        setTimeout(() => {
          interaction.deleteReply().catch(() => {});
        }, 10000);
      }

      // Generate expiry time (1 hour from now)
      const expiry = new Date(Date.now() + 60 * 60000);
      const expiryTime = expiry.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const points = rarityPoints[rarity] || 10;
      await awardPoints(interaction.user.id, interaction.user.username, points, `Report: ${pokemon}`);

      const embed = new EmbedBuilder()
        .setColor('Random')
        .setTitle(`🐾 Wild ${pokemon} spotted!`)
        .setDescription(
          `**${interaction.user.username}** has found a wild **${pokemon}**!\n` +
          `📍 Location: **${route}**\n` +
          `⏳ Available until **${expiryTime}**`
        )
        .addFields([
          { name: "📊 Rarity", value: rarity, inline: true },
          { name: "🏆 Points Awarded", value: `${points}`, inline: true },
        ])
        .setThumbnail(`https://img.pokemondb.net/artwork/${pokemon.toLowerCase().replace(/\s+/g, "-")}.jpg`)
        .setTimestamp();

      const targetChannel = await interaction.guild.channels.fetch(channelId);
      await targetChannel.send({
        content: `<@${interaction.user.id}> <@&${roleId}>`,
        embeds: [embed],
      });

      return interaction.reply({
        content: `✔ Report successfully sent to <#${channelId}>.`,
        ephemeral: true,
      });
    }

    // ==========================
    //  /cancelreport
    // ==========================
    if (commandName === "cancelreport") {
      if (!pendingReports.has(interaction.user.id)) {
        return interaction.reply({
          content: "❌ No active report to cancel.",
          ephemeral: true,
        });
      }
      pendingReports.delete(interaction.user.id);
      return interaction.reply({
        content: "🛑 Your report has been cancelled.",
        ephemeral: true,
      });
    }
  } catch (err) {
    console.error("❌ Interaction error:", err);
    return interaction.reply({
      content: "⚠ An error occurred while processing your request.",
      ephemeral: true,
    });
  }
});

// ==========================
//  Ready
// ==========================
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await db.init();
  await initGoogleSheet();
});

// ==========================
//  Login & Web Server
// ==========================
client.login(process.env.DISCORD_TOKEN);
app.get('/', (req, res) => res.send("Bot running (v14)"));
app.listen(3000, () => console.log("🌐 Web server running on port 3000"));

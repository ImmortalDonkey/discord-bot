// ----- Discord.js Setup -----
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  REST,
  Routes
} = require("discord.js");

const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
require("dotenv").config();
const app = express();

// Optional fetch for keep-alive
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// ----- Discord Client -----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =============================
// 🔄 AUTO SLASH COMMAND DEPLOY
// =============================
(async () => {
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    const commands = [
      {
        name: "setlocation",
        description: "Set your current location",
        options: [
          {
            name: "location",
            description: "Choose your current location",
            type: 3,
            required: true,
            autocomplete: true
          }
        ]
      },
      { name: "whereami", description: "Check your current location" },
      {
        name: "whereis",
        description: "Check another player's location",
        options: [
          {
            name: "user",
            description: "The user to check",
            type: 6,
            required: true
          }
        ]
      },
      { name: "locations", description: "View all active player locations" },
      { name: "clearme", description: "Mark yourself as inactive" },
      {
        name: "clearall",
        description: "Clear all player locations (Admin only)",
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
      },
      { name: "mypoints", description: "Check your current roaming points and PKD value" },
      { name: "leaderboard", description: "View the top 10 hunters by points" }
    ];

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log("✅ Slash commands deployed successfully on startup!");
  } catch (err) {
    console.error("❌ Failed to deploy commands automatically:", err);
  }
})();

// ----- Player Data -----
const playerLocations = new Map();

const availableLocations = [
  "Route 1", "Route 2", "Route 3", "Route 4", "Route 6", "Route 7",
  "Route 8", "Route 9", "Route 10", "Route 11", "Route 12", "Route 13",
  "Route 14", "Route 15", "Route 16", "Route 17", "Route 18", "Route 19",
  "Route 20", "Route 21", "Route 22", "Route 23", "Route 24", "Route 25",
  "Mudbray Ranch", "New Haven", "Nightshade", "Shore's End",
  "Stillwater Quarry", "Wild Overgrowth"
];

// ----- Roamer Lists -----
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
const SHEET_ID = "17L4nw5CIw0s0_YomuJiCwSB592Nf9-IRVJ2zogpCEwc";
let sheet;

async function initGoogleSheet() {
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const serviceAccountAuth = new JWT({
      email: creds.client_email,
      key: creds.private_key.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    sheet = doc.sheetsByIndex[0];
    console.log(`📄 Connected to Google Sheet: ${doc.title}`);

    // ⭐ AUTO-CREATE DiscordID column if missing
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;

    if (!headers.includes("DiscordID")) {
      console.log("🔧 Adding missing DiscordID column...");
      await sheet.setHeaderRow([...headers, "DiscordID"]);
      console.log("✅ DiscordID column added!");
    }

  } catch (error) {
    console.error("❌ Failed to connect to Google Sheets:", error);
  }
}

// ----- Helper: Award Points -----
async function addPoints(username, discordId, pointsToAdd) {
  if (!sheet) {
    console.error("⚠️ Google Sheet not initialized!");
    return null;
  }

  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();

  let row = null;

  // Prefer match by DiscordID
  if (discordId) {
    row = rows.find(r => String(r.DiscordID) === String(discordId));
  }

  // Fallback: match by username
  if (!row && username) {
    row = rows.find(r => String(r.Username || "").toLowerCase() === String(username).toLowerCase());
    if (row && discordId && (!row.DiscordID || row.DiscordID !== discordId)) {
      row.DiscordID = discordId;
      await row.save();
    }
  }

  if (row) {
    const currentPoints = parseInt(row.Points || 0) || 0;
    row.Points = currentPoints + pointsToAdd;
    await row.save();
    console.log(`⭐ Updated ${username} (${discordId}): +${pointsToAdd} (total ${row.Points})`);
    return parseInt(row.Points || 0);
  } else {
    const newRow = {
      Username: username || "Unknown",
      DiscordID: discordId || "",
      Points: pointsToAdd
    };
    await sheet.addRow(newRow);
    console.log(`🆕 Added new user ${newRow.Username} (${newRow.DiscordID}) with ${pointsToAdd} points`);
    return pointsToAdd;
  }
}

// ----- Bot Ready Event -----
client.once("ready", async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  await initGoogleSheet();
});

// ----- Detect Vortex Companion Reports -----
const VORTEX_ID = "858945228655951882"; // Vortex Companion bot ID

client.on("messageCreate", async (message) => {
  try {
    if (!message || !message.author) return;

    if (message.author.id !== VORTEX_ID) return;

    console.log(`[DEBUG] Message from Vortex Companion detected`);
    const content =
      message.content ||
      message.embeds?.[0]?.description ||
      message.embeds?.[0]?.title ||
      "";

    if (!content) return;

    const match = content.match(/report for (.+?) in (.+?), it will expire/i);
    if (!match) return;

    const pokemon = match[1];
    const location = match[2];
    console.log(`[DEBUG] Parsed Pokémon: ${pokemon}, Location: ${location}`);

    const reporterUser = message.interaction?.user || message.mentions?.users?.first();
    const points = 10;

    if (reporterUser) {
      await addPoints(reporterUser.username, reporterUser.id, points);
      await message.channel.send(
        `🧭 Detected a **${pokemon}** report in **${location}**! +${points} points to ${reporterUser.username}.`
      );
    } else {
      await message.channel.send(
        `🧭 Detected a **${pokemon}** report in **${location}**! (Reporter unknown — not credited)`
      );
    }
  } catch (err) {
    console.error("❌ Error handling Vortex message:", err);
  }
});

client.on("messageUpdate", async (_, newMsg) => {
  try {
    if (newMsg) client.emit("messageCreate", newMsg);
  } catch (err) {
    console.error("❌ Error forwarding messageUpdate:", err);
  }
});

// ----- Slash Command Handling -----
client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    const focused = interaction.options.getFocused();
    const filtered = availableLocations
      .filter(l => l.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25);
    await interaction.respond(filtered.map(l => ({ name: l, value: l })));
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  try {
    if (commandName === "setlocation") {
      const location = interaction.options.getString("location");
      const userId = interaction.user.id;
      const username = interaction.user.username;
      playerLocations.set(userId, { location, username, timestamp: new Date() });

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle("📍 Location Updated")
        .setDescription(`Your location has been set to: **${location}**`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === "whereami") {
      const data = playerLocations.get(interaction.user.id);
      if (!data)
        return interaction.reply({ content: "❌ You haven't set your location yet!", ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle("📍 Your Location")
        .addFields(
          { name: "Current Location", value: data.location, inline: true },
          { name: "Last Updated", value: data.timestamp.toLocaleString(), inline: true }
        );
      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === "whereis") {
      const user = interaction.options.getUser("user");
      const data = playerLocations.get(user.id);
      if (!data)
        return interaction.reply({ content: `❌ ${user.username} hasn't set a location yet!`, ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle(`📍 ${user.username}'s Location`)
        .addFields(
          { name: "Location", value: data.location, inline: true },
          { name: "Last Updated", value: data.timestamp.toLocaleString(), inline: true }
        );
      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === "locations") {
      if (playerLocations.size === 0)
        return interaction.reply({ content: "❌ No active players have set a location.", ephemeral: true });

      let desc = "";
      for (const [, data] of playerLocations) {
        desc += `**${data.username}** — ${data.location}\n`;
      }

      const embed = new EmbedBuilder()
        .setColor(0x33CCFF)
        .setTitle("🌍 Active Player Locations")
        .setDescription(desc)
        .setFooter({ text: `${playerLocations.size} active players` });

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === "clearme") {
      const userId = interaction.user.id;
      if (playerLocations.has(userId)) {
        playerLocations.delete(userId);
        await interaction.reply({ content: "✅ You have been marked as inactive.", ephemeral: true });
      } else {
        await interaction.reply({ content: "❌ You are not currently active.", ephemeral: true });
      }
    }

    else if (commandName === "clearall") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });

      playerLocations.clear();
      await interaction.reply("🧹 All player location data has been reset!");
    }

    else if (commandName === "mypoints") {
      if (!sheet)
        return interaction.reply({ content: "⚠️ Points system not ready yet!", ephemeral: true });

      await sheet.loadHeaderRow();
      const rows = await sheet.getRows();

      const discordId = interaction.user.id;
      let row = rows.find(r => String(r.DiscordID) === String(discordId));

      if (!row) {
        row = rows.find(
          r => String(r.Username || "").toLowerCase() === interaction.user.username.toLowerCase()
        );
      }

      const points = row ? parseInt(row.Points || 0) : 0;
      const value = points * 200000;

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle("💰 Your Points")
        .addFields(
          { name: "Total Points", value: `${points.toLocaleString()} pts`, inline: true },
          { name: "PKD Value", value: `${value.toLocaleString()} pkd`, inline: true }
        )
        .setFooter({ text: "1 point = 200,000 pkd" });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (commandName === "leaderboard") {
      if (!sheet)
        return interaction.reply({ content: "⚠️ Google Sheet not initialized.", ephemeral: true });

      const rows = await sheet.getRows();
      const leaderboard = rows
        .map(r => ({
          username: r.Username,
          points: parseInt(r.Points || 0)
        }))
        .filter(u => u.username && !isNaN(u.points))
        .sort((a, b) => b.points - a.points)
        .slice(0, 10);

      let desc = "";
      leaderboard.forEach((u, i) => {
        desc += `**#${i + 1}** 🏅 ${u.username} — ${u.points} pts (${(u.points * 200000).toLocaleString()} PKD)\n`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle("🏆 Roaming Points Leaderboard")
        .setDescription(desc)
        .setFooter({ text: "Top 10 Hunters • 1 point = 200,000 PKD" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error("❌ Error in interaction:", err);
    if (!interaction.replied)
      await interaction.reply({ content: "⚠️ Error executing command.", ephemeral: true });
  }
});

// ----- Login -----
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("❌ Missing DISCORD_TOKEN in environment variables!");
  process.exit(1);
}
client.login(token);

// ----- Keep-Alive Web Server -----
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(3000, () => console.log("🌐 Keep-alive web server running on port 3000"));
setInterval(() => fetch("https://discord-bot-146j.onrender.com"), 5 * 60 * 1000);
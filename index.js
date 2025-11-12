// ----- Discord.js Setup -----
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
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
  } catch (error) {
    console.error("❌ Failed to connect to Google Sheets:", error);
  }
}

// ----- Helper: Award Points -----
async function addPoints(username, pointsToAdd) {
  if (!sheet) return console.error("⚠️ Google Sheet not initialized!");

  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();
  let row = rows.find(r => r.Username === username);

  if (row) {
    const currentPoints = parseInt(row.Points || 0);
    row.Points = currentPoints + pointsToAdd;
    await row.save();
    console.log(`⭐ Updated ${username}: +${pointsToAdd} points (total ${row.Points})`);
  } else {
    await sheet.addRow({ Username: username, Points: pointsToAdd });
    console.log(`🆕 Added new user ${username} with ${pointsToAdd} points`);
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

    // Only handle messages from Vortex Companion
    if (message.author.id !== VORTEX_ID) return;

    console.log(`[DEBUG] ✅ Message from Vortex Companion detected`);
    console.log(`[DEBUG] Raw content: ${message.content || "[no text]"}`);

    // Extract text from message or embed
    const content =
      message.content ||
      message.embeds?.[0]?.description ||
      message.embeds?.[0]?.title ||
      "";

    if (!content) {
      console.log("[DEBUG] ⚠️ No readable text found in message or embed.");
      return;
    }

    // Match format like:
    // "You successfully created a report for Entei in Route 2, it will expire in 51 minutes"
    const match = content.match(/report for (.+?) in (.+?), it will expire/i);

    if (!match) {
      console.log("[DEBUG] ⚠️ Message did not match Vortex pattern:", content);
      return;
    }

    const pokemon = match[1];
    const location = match[2];
    console.log(`[DEBUG] 🧩 Parsed Pokémon: ${pokemon}, Location: ${location}`);

    // Determine who triggered the interaction (the reporter)
    const reporter =
      message.interaction?.user || message.mentions?.users?.first();

    const points = 10;

    if (reporter) {
      await addPoints(reporter.username, points);
      await message.channel.send(
        `🧭 Detected a ${pokemon} report in ${location}! +${points} points to ${reporter.username}.`
      );
      console.log(`[DEBUG] ✅ Points added to ${reporter.username}`);
    } else {
      console.log("[DEBUG] ⚠️ Reporter not found in interaction data.");
      await message.channel.send(
        `🧭 Detected a ${pokemon} report in ${location}! (Reporter unknown)`
      );
    }
  } catch (err) {
    console.error("❌ Error handling Vortex message:", err);
  }
});

// Listen to edited messages (Vortex messages often update instead of send new)
client.on("messageUpdate", async (_, newMsg) => {
  await client.emit("messageCreate", newMsg);
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
    // --- /setlocation ---
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

    // --- /whereami ---
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

    // --- /whereis ---
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

    // --- /locations ---
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

    // --- /clearme ---
    else if (commandName === "clearme") {
      const userId = interaction.user.id;
      if (playerLocations.has(userId)) {
        playerLocations.delete(userId);
        await interaction.reply({ content: "✅ You have been marked as inactive.", ephemeral: true });
      } else {
        await interaction.reply({ content: "❌ You are not currently active.", ephemeral: true });
      }
    }

    // --- /clearall (Admin only) ---
    else if (commandName === "clearall") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });

      playerLocations.clear();
      await interaction.reply("🧹 All player location data has been reset!");
    }

    // --- /mypoints ---
    else if (commandName === "mypoints") {
      if (!sheet)
        return interaction.reply({ content: "⚠️ Points system not ready yet!", ephemeral: true });

      await sheet.loadHeaderRow();
      const rows = await sheet.getRows();
      const userRow = rows.find(r => r.Username === interaction.user.username);
      const points = userRow ? parseInt(userRow.Points || 0) : 0;
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

    // --- /leaderboard ---
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

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

    if (!clientId || !guildId) {
      console.warn("⚠️ CLIENT_ID or GUILD_ID missing — skipping auto-deploy of commands.");
      return;
    }

    const commands = [
      {
        name: "setlocation",
        description: "Set your current location",
        options: [
          {
            name: "location",
            description: "Choose your current location",
            type: 3, // STRING
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
            type: 6, // USER
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
  } catch (error) {
    console.error("❌ Failed to connect to Google Sheets:", error);
  }
}

// ----- Helper: Award Points -----
// note: expects username (string)
async function addPoints(username, pointsToAdd) {
  if (!sheet) {
    console.error("⚠️ Google Sheet not initialized!");
    return;
  }

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

/**
 * Build a readable text from message content + embeds (title/description/fields)
 */
function extractReadableTextFromMessage(message) {
  let parts = [];
  if (message.content) parts.push(message.content);

  if (Array.isArray(message.embeds) && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      if (embed.title) parts.push(embed.title);
      if (embed.description) parts.push(embed.description);
      if (Array.isArray(embed.fields) && embed.fields.length > 0) {
        for (const f of embed.fields) {
          if (f.name) parts.push(f.name);
          if (f.value) parts.push(f.value);
        }
      }
      if (embed.author && embed.author.name) parts.push(embed.author.name);
    }
  }

  return parts.join("\n").trim();
}

client.on("messageCreate", async (message) => {
  try {
    if (!message || !message.author) return;

    // quick debug so you can confirm in logs what is being received
    console.log(`[MSG] From: ${message.author.username} (${message.author.id}) bot=${message.author.bot} — ${message.content ? message.content.slice(0, 200) : "[no content]"}${message.embeds?.length ? ` (embeds:${message.embeds.length})` : ""}`);

    // Only care about Vortex Companion messages here
    if (message.author.id !== VORTEX_ID) return;

    console.log("[DEBUG] ✅ Message came from Vortex Companion (ID match).");

    const content = extractReadableTextFromMessage(message);
    if (!content) {
      console.log("[DEBUG] ⚠️ no readable content found in message or embeds.");
      return;
    }

    // Try flexible regex patterns to capture:
    // "You successfully created a report for Entei in Route 2, it will expire in 51 minutes"
    // or "You successfully created a report for Entei in Route 2,it will expire..."
    // or small variations
    const regex = /report\s+for\s+(.+?)\s+in\s+(.+?)(?:[,\.]?\s*it will expire|\s*\(|$)/i;
    const match = content.match(regex);

    if (!match) {
      console.log("[DEBUG] ⚠️ Vortex message didn't match expected pattern. Content:\n", content);
      return;
    }

    const pokemon = match[1].trim();
    const location = match[2].trim();
    console.log(`[DEBUG] Parsed -> pokemon: "${pokemon}", location: "${location}"`);

    // determine reporter: prefer interaction.user, then mentions, then embed.author name if available
    let reporterUser = message.interaction?.user || message.mentions?.users?.first() || null;
    let reporterName = null;
    if (reporterUser) {
      reporterName = reporterUser.username;
    } else {
      // fallback to embed author or try to parse "You successfully created a report for X" — often the reporter is the user who invoked the command,
      // which may not be visible in the message object; embed author sometimes contains the username
      const embedAuthorName = message.embeds?.[0]?.author?.name;
      if (embedAuthorName) reporterName = embedAuthorName;
    }

    const points = (function determinePointsByPokemon(name) {
      if (!name) return 0;
      const lowered = name.toLowerCase();
      for (const [group, list] of Object.entries(rarityGroups)) {
        if (list.some(p => p.toLowerCase() === lowered)) return rarityPoints[group] || 0;
      }
      // default small reward
      return 10;
    })(pokemon);

    if (!reporterName) {
      // no reporter found: log and optionally still post a notice
      console.log(`[DEBUG] Reporter not found for ${pokemon} @ ${location}. Points: ${points}`);
      try {
        await message.channel.send(`🧭 Detected a **${pokemon}** report in **${location}**! Reporter unknown — points not awarded.`);
      } catch (err) {
        console.warn("Failed to send reporter-unknown message:", err);
      }
      return;
    }

    // Finally add points (addPoints expects a username string)
    try {
      await addPoints(reporterName, points);
      // mention the user if we have their ID; otherwise just show name
      const mention = reporterUser ? `<@${reporterUser.id}>` : `**${reporterName}**`;
      await message.channel.send(`🧭 Detected a **${pokemon}** report in **${location}**! +${points} points to ${mention}.`);
      console.log(`[DEBUG] Awarded ${points} pts to ${reporterName}`);
    } catch (err) {
      console.error("❌ Error awarding points:", err);
    }

  } catch (err) {
    console.error("❌ Error in Vortex message handler:", err);
  }
});

// If Vortex edits messages, handle updates (re-run messageCreate logic)
client.on("messageUpdate", async (_, newMsg) => {
  // newMsg can be partial; fetch full if necessary - but try to forward as-is:
  if (!newMsg) return;
  client.emit("messageCreate", newMsg);
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

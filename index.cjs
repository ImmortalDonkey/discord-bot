require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const db = require('./database');
const app = express();

// ==========================
// Discord Client (v14)
// ==========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ==========================
// In-Memory Storage
// ==========================
const playerLocations = new Map();
const pendingReports = new Map();

const availableLocations = [
  "Route 1", "Route 2", "Route 3", "Route 4", "Route 6", "Route 7",
  "Route 8", "Route 9", "Route 10", "Route 11", "Route 12", "Route 13",
  "Route 14", "Route 15", "Route 16", "Route 17", "Route 18", "Route 19",
  "Route 20", "Route 21", "Route 22", "Route 23", "Route 24", "Route 25",
  "Mudbray Ranch", "New Haven", "Nightshade", "Shore's End",
  "Stillwater Quarry", "Wild Overgrowth"
];

const rarityGroups = {
  roamerMonth: ["Clone Venusaur", "Clone Charizard", "Clone Blastoise", "Ancient Jigglypuff", "Ancient Alakazam", "Ancient Gengar", "Crystal Onix", "Pink Rhyhorn", "Snorlax (Snowman)", "Mewtwo (Shadow)", "Golden Sudowoodo", "XD001", "Reddy", "Meta Groudon", "Rayquaza (Illusion)", "Dialga (Primal)", "Z2"],
  paradox: ["Walking Wake", "Gouging Fire", "Raging Bolt", "Iron Leaves", "Iron Boulder", "Iron Crown"],
  legendary: ["Raikou", "Entei", "Suicune", "Latias", "Latios", "Glastrier", "Spectrier", "Koraidon", "Miraidon"],
  rare: ["Cyclizar", "Gimmighoul (Roaming)"],
  common: ["Zygarde (Cell)", "Bramblin", "Bombirdier", "Varoom"]
};

const rarityPoints = {
  roamerMonth: 30,
  paradox: 200,
  legendary: 20,
  rare: 20,
  common: 1
};

// ==========================
// Google Sheets Setup
// ==========================
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
let sheet = null;

async function initGoogleSheet() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    console.log("⚠ Sheets disabled (missing private key or email).");
    return;
  }

  try {
    const serviceAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAuth);
    await doc.loadInfo();
    sheet = doc.sheetsByIndex[0];
    console.log(`📄 Connected to Sheet: ${sheet.title}`);
  } catch (err) {
    console.log("❌ Sheets setup failed:", err);
  }
}

// ==========================
// Points Logic
// ==========================
function getRarity(pokemon) {
  return Object.keys(rarityGroups).find(r =>
    rarityGroups[r].some(p => p.toLowerCase() === pokemon.toLowerCase())
  ) || 'common';
}

async function awardPoints(id, username, pts, reason = "") {
  return await db.addPoints(id, username, pts, reason);
}

// ==========================
// Interaction Handling
// ==========================
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand() && !interaction.isAutocomplete() && !interaction.isButton()) return;

  // ======================
  // BUTTON HANDLERS (NEW)
  // ======================
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("approveclaim_")) {
      const [_, userId, pointsRequested] = interaction.customId.split("_");

      const userRow = await db.getUserById(userId);
      const oldPoints = userRow?.points || 0;
      const newPoints = oldPoints - parseInt(pointsRequested);

      await db.addPoints(userId, userRow.username, -parseInt(pointsRequested), "PKD Claim");

      const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('✔ Claim Approved')
        .setDescription(`Points successfully deducted for <@${userId}>.`)
        .addFields(
          { name: 'Points Requested', value: pointsRequested, inline: true },
          { name: 'Old Total', value: oldPoints.toString(), inline: true },
          { name: 'New Total', value: newPoints.toString(), inline: true }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Close Ticket")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }

    if (interaction.customId === "close_ticket") {
      await interaction.reply({ content: "🔒 Ticket will close shortly...", ephemeral: true });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 4000);
      return;
    }
  }

  // ======================
  // AUTOCOMPLETE
  // ======================
  if (interaction.isAutocomplete()) {
    const focused = interaction.options.getFocused();
    let choices = [];

    if (interaction.commandName === "report") {
      const option = interaction.options.getFocused(true).name;
      choices = option === "pokemon" ? Object.values(rarityGroups).flat() : availableLocations;
    }
    if (interaction.commandName === "setlocation") {
      choices = availableLocations;
    }

    const filtered = choices
      .filter(c => c.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25);

    return interaction.respond(filtered.map(c => ({ name: c, value: c })));
  }

  // ======================
  // SLASH COMMANDS
  // ======================
  if (interaction.isCommand()) {
    const { commandName } = interaction;
    const user = interaction.user;

    // --- Location commands ---
    if (commandName === "setlocation") {
      const loc = interaction.options.getString("location");
      playerLocations.set(user.id, { location: loc, timestamp: new Date(), username: user.username });
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("Green").setTitle("📍 Location Updated").setDescription(`Your location is now **${loc}**`)]
      });
    }

    if (commandName === "whereami") {
      const data = playerLocations.get(user.id);
      if (!data) return interaction.reply({ content: "❌ You haven't set a location!", ephemeral: true });
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("Blue").setTitle("📍 Your Location").addFields(
          { name: "Location", value: data.location },
          { name: "Updated", value: data.timestamp.toLocaleString() }
        )]
      });
    }

    if (commandName === "whereis") {
      const targetUser = interaction.options.getUser("user");
      const data = playerLocations.get(targetUser.id);
      if (!data) return interaction.reply({ content: "❌ They haven't set a location.", ephemeral: true });
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("Orange").setTitle(`📍 ${targetUser.username}’s Location`).addFields(
          { name: "Location", value: data.location },
          { name: "Updated", value: data.timestamp.toLocaleString() }
        )]
      });
    }

    if (commandName === "clearme") {
      playerLocations.delete(user.id);
      return interaction.reply({ content: "🧹 You were marked inactive.", ephemeral: true });
    }

    if (commandName === "clearall") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Admins only.", ephemeral: true });
      }
      playerLocations.clear();
      return interaction.reply("🧹 All locations cleared.");
    }

    // --- Points / Leaderboard ---
    if (commandName === "mypoints") {
      const row = await db.getUserById(user.id);
      const pts = row?.points || 0;
      const value = pts * 200000;
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("Gold").setTitle("💰 Your Points").addFields(
          { name: "Total Points", value: String(pts) },
          { name: "PKD Value", value: value.toLocaleString() + " pkd" }
        )],
        ephemeral: true
      });
    }

    if (commandName === "leaderboard") {
      const rows = await db.getLeaderboard(10);
      if (rows.length === 0) return interaction.reply({ content: "No data yet.", ephemeral: true });

      let desc = rows.map((u, i) => `**#${i + 1}** — ${u.username} — ${u.points} pts`).join("\n");
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor("Gold").setTitle("🏆 Top Hunters").setDescription(desc)]
      });
    }

    // --- Report ---
    if (commandName === "report") {
      const pokemon = interaction.options.getString("pokemon");
      const route = interaction.options.getString("route");
      const rarity = getRarity(pokemon);
      const roleId = process.env[`ROLE_${rarity.toUpperCase()}`];
      const channelId = process.env[`CHANNEL_${rarity.toUpperCase()}`];

      pendingReports.set(user.id, { pokemon, route });

      if (interaction.channel.id !== channelId) {
        await interaction.reply({ content: `⚠ Wrong channel! Report will be moved to <#${channelId}>.`, ephemeral: true });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
      }

      const now = new Date();
      const expiry = new Date(now);
      expiry.setMinutes(59, 59, 999);
      const expiryTime = expiry.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const rarityLabels = {
        roamerMonth: "Roamer of the Month",
        paradox: "Paradox",
        legendary: "Legendary",
        rare: "Rare",
        common: "Common"
      };
      const rarityLabel = rarityLabels[rarity] || rarity;

      const points = rarityPoints[rarity] || 10;
      await awardPoints(user.id, user.username, points, `Report: ${pokemon}`);

      const embed = new EmbedBuilder()
        .setColor('Random')
        .setTitle(`🐾 Wild ${pokemon} spotted!`)
        .setDescription(`**${user.username}** has found a wild **${pokemon}**!\n📍 Location: **${route}**\n⏳ Available until **${expiryTime}**`)
        .addFields(
          { name: '📊 Rarity', value: rarityLabel, inline: true },
          { name: '🏆 Points Awarded', value: String(points), inline: true }
        )
        .setThumbnail(`https://img.pokemondb.net/artwork/${pokemon.toLowerCase().replace(/\s/g, '-')}.jpg`)
        .setTimestamp();

      const targetChannel = await interaction.guild.channels.fetch(channelId);
      await targetChannel.send({
        content: `<@${user.id}> <@&${roleId}>`,
        embeds: [embed]
      });

      return interaction.reply({ content: `✔ Report submitted in <#${channelId}>.`, ephemeral: true });
    }

    if (commandName === "cancelreport") {
      if (!pendingReports.has(user.id)) {
        return interaction.reply({ content: "❌ No report to cancel.", ephemeral: true });
      }
      pendingReports.delete(user.id);
      return interaction.reply({ content: "🛑 Report cancelled.", ephemeral: true });
    }

    // ===========================
    // NEW CLAIM COMMANDS
    // ===========================
    if (commandName === 'claim') {
      const pointsRequested = interaction.options.getInteger('points');
      const userRow = await db.getUserById(user.id);
      const currentPoints = userRow?.points || 0;

      if (pointsRequested <= 0)
        return interaction.reply({ content: '❌ Invalid points.', ephemeral: true });

      if (currentPoints < pointsRequested)
        return interaction.reply({ content: `❌ You only have **${currentPoints}** points.`, ephemeral: true });

      const staffRoles = process.env.STAFF_ROLES.split(',');

      const ticketChannel = await interaction.guild.channels.create({
        name: `claim-${user.username}-${Date.now().toString().slice(-3)}`,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: ['ViewChannel'] },
          { id: user.id, allow: ['ViewChannel', 'SendMessages'] },
          ...staffRoles.map(r => ({ id: r, allow: ['ViewChannel', 'SendMessages'] }))
        ],
        reason: `Point claim by ${user.username}`
      });

      await interaction.reply({ content: `🎫 Claim created: <#${ticketChannel.id}>`, ephemeral: true });

      await ticketChannel.send({
        content: `<@${user.id}> ${staffRoles.map(r => `<@&${r}>`).join(' ')}`,
        embeds: [
          new EmbedBuilder()
            .setColor('Gold')
            .setTitle('💱 Point Conversion Request')
            .setDescription(`${user.username} wants to convert **${pointsRequested}** points into PKD.`)
            .addFields(
              { name: 'User', value: `<@${user.id}>`, inline: true },
              { name: 'Points Requested', value: `${pointsRequested}`, inline: true },
              { name: 'Current Points', value: `${currentPoints}`, inline: true }
            )
            .setTimestamp()
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`approveclaim_${user.id}_${pointsRequested}`)
              .setLabel("Approve")
              .setStyle(ButtonStyle.Success)
          )
        ]
      });
      return;
    }

    // Override /approveclaim to force button usage
    if (commandName === 'approveclaim') {
      return interaction.reply({ content: '⚠ Use the approval button instead.', ephemeral: true });
    }

    if (commandName === 'denyclaim') {
      await interaction.reply('❌ Claim denied.');
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }
  }
});

// ==========================
// Ready Event
// ==========================
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await db.init();
  await initGoogleSheet();
});

// ==========================
// Login + Web Server
// ==========================
client.login(process.env.DISCORD_TOKEN);

app.get("/", (_, res) => res.send("Bot running (v14)"));
app.listen(3000, () => console.log("🌐 Web server running on port 3000"));

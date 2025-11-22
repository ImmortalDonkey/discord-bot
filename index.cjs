require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const db = require('./database.cjs');
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

// 🔥 Bounty System: in-memory storage
const pendingBounties = new Map(); // bountyId -> bountyObject
const activeBounties = new Map();  // bountyId -> bountyObject
// 🔥 End bounty storage

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
// Helper: bounty time logic
// ==========================
function clampHours(h) {
  if (!h || isNaN(h)) return 6;
  let hh = parseInt(h);
  if (hh < 1) hh = 1;
  if (hh > 24) hh = 24;
  return hh;
}

function parseHourFromStartTimeString(str) {
  // expects "HH:MM"
  if (!str || typeof str !== 'string') return 0;
  const parts = str.split(':');
  const hour = parseInt(parts[0], 10);
  if (isNaN(hour) || hour < 0 || hour > 23) return 0;
  return hour;
}

function getNextOccurrenceOfHour(hour) {
  const now = new Date();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(hour);
  if (start <= now) {
    // move to next day
    start.setDate(start.getDate() + 1);
  }
  return start;
}

// ==========================
// Interaction Handling
// ==========================
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand() && !interaction.isAutocomplete() && !interaction.isButton()) return;

  // ======================
  // BUTTON HANDLERS
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

    // 🔥 Bounty buttons (approve / deny)
    if (interaction.customId.startsWith('approvebounty_') || interaction.customId.startsWith('denybounty_')) {
      const isApprove = interaction.customId.startsWith('approvebounty_');
      const prefix = isApprove ? 'approvebounty_' : 'denybounty_';
      const bountyId = interaction.customId.substring(prefix.length);

      const bounty = pendingBounties.get(bountyId);
      if (!bounty) {
        await interaction.reply({ content: '❌ Bounty not found or already processed.', ephemeral: true });
        return;
      }

      // staff check
      const staffRolesEnv = process.env.STAFF_ROLES || '';
      const staffRoles = staffRolesEnv.split(',').map(s => s.trim()).filter(Boolean);
      const memberRoleIds = interaction.member.roles.cache.map(r => r.id);
      const isStaff = staffRoles.some(r => memberRoleIds.includes(r));
      if (!isStaff && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '❌ You do not have permission to process bounties.', ephemeral: true });
        return;
      }

      if (!isApprove) {
        // Deny
        pendingBounties.delete(bountyId);

        const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0] || new EmbedBuilder())
          .setColor('Red')
          .setTitle('📝 Bounty Request (Denied)');

        await interaction.message.edit({ embeds: [deniedEmbed], components: [] });
        await interaction.reply({ content: '❌ Bounty request denied.', ephemeral: true });
        return;
      }

      // Approve
      pendingBounties.delete(bountyId);
      activeBounties.set(bountyId, {
        ...bounty,
        approved: true,
        approvedBy: interaction.user.id
      });

      const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0] || new EmbedBuilder())
        .setColor('Green')
        .setTitle('📝 Bounty Request (Approved)');

      await interaction.message.edit({ embeds: [approvedEmbed], components: [] });

      const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
      const bountyChannel = bountyChannelId
        ? await interaction.guild.channels.fetch(bountyChannelId).catch(() => null)
        : null;

      if (!bountyChannel) {
        await interaction.reply({
          content: '❌ Bounty announcement channel not found. Check BOUNTY_CHANNEL_ID in .env.',
          ephemeral: true
        });
        return;
      }

      const rolePingId = process.env.ROLE_BOUNTY_HUNTER;
      const rolePing = rolePingId ? `<@&${rolePingId}>` : '';

      const pokemonList = bounty.pokemons.join(', ');
      const startUnix = Math.floor(bounty.startTime.getTime() / 1000);
      const endUnix = Math.floor(bounty.endTime.getTime() / 1000);

      // Immediate announcement on approval
      const immediateEmbed = new EmbedBuilder()
        .setTitle('✅ Bounty Approved')
        .setDescription('A new bounty has been approved.')
        .addFields(
          { name: 'Pokémon', value: pokemonList, inline: false },
          { name: 'Starts', value: `<t:${startUnix}:F> (<t:${startUnix}:R>)`, inline: false },
          { name: 'Ends', value: `<t:${endUnix}:F> (<t:${endUnix}:R>)`, inline: false },
          { name: 'Duration', value: `${bounty.durationHours} hour(s)`, inline: true },
          { name: 'Requested by', value: `<@${bounty.requesterId}>`, inline: true }
        )
        .setTimestamp();

      await bountyChannel.send({
        content: rolePing || '',
        embeds: [immediateEmbed]
      }).catch(() => {});

      await interaction.reply({ content: '✔ Bounty approved. Announcements scheduled.', ephemeral: true });

      const now = Date.now();
      const delayToStart = Math.max(bounty.startTime.getTime() - now, 0);
      const delayToEnd = Math.max(bounty.endTime.getTime() - now, 0);

      // Scheduled announcement at start time
      setTimeout(async () => {
        const stillActive = activeBounties.get(bountyId);
        if (!stillActive) return;

        const startEmbed = new EmbedBuilder()
          .setTitle('🔥 Bounty Started!')
          .setDescription('The bounty is now active.')
          .addFields(
            { name: 'Pokémon', value: pokemonList, inline: false },
            { name: 'Started', value: `<t:${startUnix}:F>`, inline: false },
            { name: 'Ends', value: `<t:${endUnix}:F> (<t:${endUnix}:R>)`, inline: false },
            { name: 'Requested by', value: `<@${stillActive.requesterId}>`, inline: true }
          )
          .setTimestamp();

        await bountyChannel.send({
          content: rolePing || '',
          embeds: [startEmbed]
        }).catch(() => {});
      }, delayToStart);

      // Scheduled announcement at end time
      setTimeout(async () => {
        const stillActive = activeBounties.get(bountyId);
        if (!stillActive) return;
        activeBounties.delete(bountyId);

        const endEmbed = new EmbedBuilder()
          .setTitle('🏁 Bounty Finished')
          .setDescription('The bounty has ended. Submissions are now closed.')
          .addFields(
            { name: 'Pokémon', value: pokemonList, inline: false },
            { name: 'Ended', value: `<t:${endUnix}:F>`, inline: false },
            { name: 'Requested by', value: `<@${stillActive.requesterId}>`, inline: true }
          )
          .setTimestamp();

        await bountyChannel.send({
          content: rolePing || '',
          embeds: [endEmbed]
        }).catch(() => {});
      }, delayToEnd);

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

    if (interaction.commandName === "bountyrequest") {
      const option = interaction.options.getFocused(true).name;
      if (option === 'pokemon1' || option === 'pokemon2' || option === 'pokemon3') {
        choices = Object.values(rarityGroups).flat();
      } else if (option === 'starttime') {
        // 00:00 .. 23:00
        const allTimes = [];
        for (let h = 0; h < 24; h++) {
          const hh = h.toString().padStart(2, '0');
          allTimes.push(`${hh}:00`);
        }
        choices = allTimes;
      }
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

    // Location Commands
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

    // Points and Leaderboard
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

    // Report
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

      const rarityLabel = {
        roamerMonth: "Roamer of the Month",
        paradox: "Paradox",
        legendary: "Legendary",
        rare: "Rare",
        common: "Common"
      }[rarity] || rarity;

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

    // CLAIM COMMAND
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
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: ['ViewChannel'] },
          { id: user.id, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] },
          ...staffRoles.map(r => ({ id: r, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] })),
          { id: client.user.id, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] }
        ],
        reason: `Point claim by ${user.username}`
      });

      const readyChannel = await interaction.guild.channels.fetch(ticketChannel.id).catch(() => null);
      if (!readyChannel) return interaction.reply({ content: '❌ Ticket channel created but not accessible.', ephemeral: true });

      await interaction.reply({ content: `🎫 Claim created: <#${readyChannel.id}>`, ephemeral: true });

      await readyChannel.send({
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
      }).catch(err => console.error('❌ Ticket message failed:', err));
      return;
    }

    // Override legacy commands
    if (commandName === 'approveclaim') {
      return interaction.reply({ content: '⚠ Use the approval button instead.', ephemeral: true });
    }

    if (commandName === 'denyclaim') {
      await interaction.reply('❌ Claim denied.');
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }

    // ===========================
    // BOUNTYREQUEST COMMAND
    // ===========================
    if (commandName === 'bountyrequest') {
      // Role restriction
      const bountyRoleId = process.env.ROLE_BOUNTY_HUNTER || null;
      let hasRole = false;

      if (bountyRoleId) {
        hasRole = interaction.member.roles.cache.has(bountyRoleId);
      } else {
        // Fallback: by name
        hasRole = interaction.member.roles.cache.some(r =>
          r.name === 'Bounty Hunter' || r.name === 'Roaming Bounty Hunter'
        );
      }

      if (!hasRole) {
        return interaction.reply({
          content: '🚫 You do not have permission to request bounties.',
          ephemeral: true
        });
      }

      const pokemon1 = interaction.options.getString('pokemon1');
      const pokemon2 = interaction.options.getString('pokemon2');
      const pokemon3 = interaction.options.getString('pokemon3');
      const notes = interaction.options.getString('notes') || '';
      const startTimeStr = interaction.options.getString('starttime');
      const durationHours = interaction.options.getInteger('duration');

      const pokemons = [pokemon1, pokemon2, pokemon3].filter(Boolean);
      const hour = parseHourFromStartTimeString(startTimeStr);
      const startTime = getNextOccurrenceOfHour(hour);
      const durationMs = durationHours * 60 * 60 * 1000;
      const endTime = new Date(startTime.getTime() + durationMs);

      const bountyId = `${Date.now()}_${interaction.user.id}`;
      const bounty = {
        id: bountyId,
        requesterId: interaction.user.id,
        requesterName: interaction.user.username,
        pokemons,
        notes,
        startTime,
        endTime,
        durationHours,
        createdAt: new Date()
      };

      pendingBounties.set(bountyId, bounty);

      const requestChannelId = process.env.BOUNTY_REQUEST_CHANNEL_ID;
      const requestChannel = requestChannelId
        ? await interaction.guild.channels.fetch(requestChannelId).catch(() => null)
        : null;

      if (!requestChannel) {
        return interaction.reply({
          content: '❌ Bounty request channel not configured. Ask an admin to set BOUNTY_REQUEST_CHANNEL_ID in .env.',
          ephemeral: true
        });
      }

      const staffRolesEnv = process.env.STAFF_ROLES || '';
      const staffMention = staffRolesEnv
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(id => `<@&${id}>`)
        .join(' ');

      const pokemonList = pokemons.join(', ');
      const startUnix = Math.floor(startTime.getTime() / 1000);
      const endUnix = Math.floor(endTime.getTime() / 1000);

      const embed = new EmbedBuilder()
        .setTitle('📝 New Bounty Request')
        .setDescription('A new bounty has been requested and is awaiting staff approval.')
        .addFields(
          { name: 'Pokémon', value: pokemonList, inline: false },
          { name: 'Requested Start', value: `<t:${startUnix}:F>`, inline: false },
          { name: 'Requested End', value: `<t:${endUnix}:F>`, inline: false },
          { name: 'Duration', value: `${durationHours} hour(s)`, inline: true },
          { name: 'Requested by', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Notes', value: notes || 'None', inline: false }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approvebounty_${bountyId}`)
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`denybounty_${bountyId}`)
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger)
      );

      await requestChannel.send({
        content: staffMention || '',
        embeds: [embed],
        components: [row]
      }).catch(err => console.error('❌ Failed to send bounty request:', err));

      await interaction.reply({
        content: '✅ Bounty request submitted. Staff have been notified.',
        ephemeral: true
      });
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
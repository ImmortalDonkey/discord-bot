require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
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
const { createCanvas, loadImage } = require('canvas');

const db = require('./database.cjs');
const app = express();

// ==========================
// Basic paths for images
// ==========================
const CARD_IMAGES_DIR = path.join(__dirname, 'card-images');
if (!fs.existsSync(CARD_IMAGES_DIR)) {
  fs.mkdirSync(CARD_IMAGES_DIR, { recursive: true });
}

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

// Rarity groups (names unchanged, but priority handled separately)
const rarityGroups = {
  roamerMonth: [
    "Clone Venusaur", "Clone Charizard", "Clone Blastoise",
    "Ancient Jigglypuff", "Ancient Alakazam", "Ancient Gengar",
    "Crystal Onix", "Pink Rhyhorn", "Snorlax (Snowman)",
    "Mewtwo (Shadow)", "Golden Sudowoodo", "XD001", "Reddy",
    "Meta Groudon", "Rayquaza (Illusion)", "Dialga (Primal)", "Z2"
  ],
  paradox: [
    "Walking Wake", "Gouging Fire", "Raging Bolt",
    "Iron Leaves", "Iron Boulder", "Iron Crown"
  ],
  legendary: [
    "Raikou", "Entei", "Suicune",
    "Latias", "Latios",
    "Glastrier", "Spectrier",
    "Koraidon", "Miraidon"
  ],
  rare: ["Cyclizar", "Gimmighoul (Roaming)"],
  common: ["Zygarde (Cell)", "Bramblin", "Bombirdier", "Varoom"]
};

// Rarity priority (highest -> lowest)
const rarityPriority = ['paradox', 'roamerMonth', 'legendary', 'rare', 'common'];

const rarityPoints = {
  roamerMonth: 30,
  paradox: 200,
  legendary: 20,
  rare: 20,
  common: 1
};

// ==========================
// Rank System (lifetime-based)
// ==========================
const RANKS = [
  { name: 'Rookie Trainer', min: 0 },
  { name: 'Trainer', min: 50 },
  { name: 'Ace Trainer', min: 250 },
  { name: 'Gym Challenger', min: 600 },
  { name: 'Gym Leader', min: 2000 },
  { name: 'Elite Four', min: 3000 },
  { name: 'Champion', min: 5000 },
  { name: 'Master', min: 10000 }
];

function getRankName(lifetime) {
  let rank = RANKS[0].name;
  for (const r of RANKS) {
    if (lifetime >= r.min) rank = r.name;
  }
  return rank;
}

// Display label for rarity (your preferred wording)
function getRarityDisplayName(key) {
  switch (key) {
    case 'paradox':
      return 'Paradox';
    case 'roamerMonth':
      return 'Roamer of the Month';
    case 'legendary':
    case 'rare':
      return 'Legendary / Rare';
    case 'common':
    default:
      return 'Common';
  }
}

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
// Points + Rarity Logic
// ==========================
function getRarity(pokemon) {
  const name = (pokemon || '').toLowerCase();
  for (const key of rarityPriority) {
    const list = rarityGroups[key] || [];
    if (list.some(p => p.toLowerCase() === name)) return key;
  }
  return 'common';
}

/**
 * Given a list of Pokémon names, return the *highest* rarity according
 * to the configured priority.
 */
function getHighestRarityForList(pokemonNames = []) {
  if (!pokemonNames.length) return 'common';
  let best = 'common';
  for (const name of pokemonNames) {
    const r = getRarity(name);
    if (rarityPriority.indexOf(r) < rarityPriority.indexOf(best)) {
      best = r;
    }
  }
  return best;
}

async function awardPoints(id, username, pts, reason = "") {
  // db.addPoints already handles lifetime_points vs points (PKD)
  return await db.addPoints(id, username, pts, reason);
}

// ==========================
// Helper: bounty time logic
// ==========================
function clampHours(h) {
  if (!h || isNaN(h)) return 6;
  let hh = parseInt(h);
  if (hh < 1) hh = 1;
  if (hh > 72) hh = 72;
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
// Canvas helpers – bounty cards
// ==========================

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return y;
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}

async function fetchAvatarImage(member) {
  try {
    if (!member) return null;
    const url = member.displayAvatarURL({ extension: 'png', size: 256 });
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const img = await loadImage(buffer);
    return img;
  } catch (err) {
    console.error('Failed to load avatar for card:', err);
    return null;
  }
}

/**
 * Generate a bounty card PNG and save to /card-images.
 * Returns { filePath, fileName } or null on failure.
 */
async function generateBountyCardImage(bounty, member) {
  try {
    const width = 1024;
    const height = 512;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#101116';
    ctx.fillRect(0, 0, width, height);

    // Outer rounded-ish border
    ctx.strokeStyle = '#3fd0ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Left panel
    const leftX = 40;
    const leftY = 60;
    const leftWidth = width * 0.6 - 60;

    // Right art box
    const artX = width * 0.6 + 20;
    const artY = 60;
    const artW = width * 0.35;
    const artH = height - 120;

    ctx.strokeStyle = '#7afc7a';
    ctx.lineWidth = 3;
    ctx.strokeRect(artX, artY, artW, artH);

    // Text styling
    ctx.font = '22px Sans-Serif';
    ctx.fillStyle = '#9bd5ff';
    ctx.textAlign = 'left';

    // Get user info for rank
    const userRow = await db.getUserById(bounty.requesterId);
    const lifetime = userRow?.lifetime_points || 0;
    const rankName = getRankName(lifetime);

    const displayRarity = getRarityDisplayName(getHighestRarityForList(bounty.pokemons));
    const displayName = member ? (member.nickname || member.displayName || member.user.username) : (bounty.requesterName || 'Unknown');

    const labelColor = '#6fe1ff';
    const valueColor = '#e5ffe5';

    let y = leftY;

    function drawField(label, value) {
      ctx.fillStyle = labelColor;
      ctx.fillText(label.toUpperCase() + ':', leftX, y);
      ctx.fillStyle = valueColor;
      y = wrapText(ctx, value, leftX + 180, y, leftWidth - 190, 24);
      y += 16;
    }

    const pokemonLines = bounty.pokemons.map(p => `• ${p}`).join('  ');
    const startStr = bounty.startTime.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
    const durationStr = `${bounty.durationHours} hour(s)`;
    const rewardStr = `${(bounty.reward || 0).toLocaleString()} PKD`;
    const noteStr = bounty.notes || 'None';

    drawField('Username', displayName);
    drawField('Rank', rankName);
    drawField('Pokémon Targets', pokemonLines);
    drawField('Rarity', displayRarity);
    drawField('Start Time', startStr);
    drawField('Duration', durationStr);
    drawField('Reward', rewardStr);
    drawField('Note', noteStr);

    // Avatar in art box
    const avatarImage = await fetchAvatarImage(member);
    if (avatarImage) {
      // center avatar inside art box
      const scale = Math.min(artW / avatarImage.width, artH / avatarImage.height) * 0.9;
      const drawW = avatarImage.width * scale;
      const drawH = avatarImage.height * scale;
      const dx = artX + (artW - drawW) / 2;
      const dy = artY + (artH - drawH) / 2;

      ctx.save();
      // slightly rounded clip
      const radius = 24;
      ctx.beginPath();
      ctx.moveTo(dx + radius, dy);
      ctx.lineTo(dx + drawW - radius, dy);
      ctx.quadraticCurveTo(dx + drawW, dy, dx + drawW, dy + radius);
      ctx.lineTo(dx + drawW, dy + drawH - radius);
      ctx.quadraticCurveTo(dx + drawW, dy + drawH, dx + drawW - radius, dy + drawH);
      ctx.lineTo(dx + radius, dy + drawH);
      ctx.quadraticCurveTo(dx, dy + drawH, dx, dy + drawH - radius);
      ctx.lineTo(dx, dy + radius);
      ctx.quadraticCurveTo(dx, dy, dx + radius, dy);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(avatarImage, dx, dy, drawW, drawH);
      ctx.restore();
    }

    const buffer = canvas.toBuffer('image/png');
    const fileName = `bounty-${bounty.id}.png`;
    const filePath = path.join(CARD_IMAGES_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    return { filePath, fileName };
  } catch (err) {
    console.error('❌ Failed to generate bounty card image:', err);
    return null;
  }
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
    // Points claim approve button
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

    // Ticket close button
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

      // Determine rarity of bounty (highest rarity among targets)
      const bountyRarity = getHighestRarityForList(bounty.pokemons);
      const rarityDisplay = getRarityDisplayName(bountyRarity);
      const rarityRoleId = process.env[`ROLE_${bountyRarity.toUpperCase()}`];
      const allBountyRoleId = process.env.ROLE_BOUNTY_ALL;
      const pingParts = [];
      if (rarityRoleId) pingParts.push(`<@&${rarityRoleId}>`);
      if (allBountyRoleId) pingParts.push(`<@&${allBountyRoleId}>`);
      const pingText = pingParts.join(' ');

      const pokemonListLines = bounty.pokemons.map(p => `• ${p}`).join('\n');
      const startUnix = Math.floor(bounty.startTime.getTime() / 1000);
      const endUnix = Math.floor(bounty.endTime.getTime() / 1000);

      // Immediate announcement on approval
      const immediateEmbed = new EmbedBuilder()
        .setTitle('✅ Bounty Approved')
        .setDescription('A new bounty has been approved.')
        .addFields(
          { name: 'Trainer', value: `<@${bounty.requesterId}>`, inline: true },
          { name: 'Rarity', value: rarityDisplay, inline: true },
          { name: 'Reward', value: `${bounty.reward.toLocaleString()} PKD`, inline: false },
          { name: 'Pokémon Targets', value: pokemonListLines, inline: false },
          { name: 'Starts', value: `<t:${startUnix}:F> (<t:${startUnix}:R>)`, inline: false },
          { name: 'Ends', value: `<t:${endUnix}:F> (<t:${endUnix}:R>)`, inline: false },
          { name: 'Duration', value: `${bounty.durationHours} hour(s)`, inline: true },
          { name: 'Note', value: bounty.notes || 'None', inline: false }
        )
        .setTimestamp();

      await bountyChannel.send({
        content: pingText || '',
        embeds: [immediateEmbed]
      }).catch(() => {});

      await interaction.reply({ content: '✔ Bounty approved. Announcements scheduled.', ephemeral: true });

      const now = Date.now();
      const delayToStart = Math.max(bounty.startTime.getTime() - now, 0);
      const delayToEnd = Math.max(bounty.endTime.getTime() - now, 0);

      // Scheduled announcement at start time (with card image)
      setTimeout(async () => {
        const stillActive = activeBounties.get(bountyId);
        if (!stillActive) return;

        const startEmbed = new EmbedBuilder()
          .setTitle('🔥 Bounty Started!')
          .setDescription('The bounty is now active.')
          .addFields(
            { name: 'Trainer', value: `<@${stillActive.requesterId}>`, inline: true },
            { name: 'Rarity', value: rarityDisplay, inline: true },
            { name: 'Reward', value: `${stillActive.reward.toLocaleString()} PKD`, inline: false },
            { name: 'Pokémon Targets', value: pokemonListLines, inline: false },
            { name: 'Started', value: `<t:${startUnix}:F>`, inline: false },
            { name: 'Ends', value: `<t:${endUnix}:F> (<t:${endUnix}:R>)`, inline: false },
            { name: 'Duration', value: `${stillActive.durationHours} hour(s)`, inline: true },
            { name: 'Note', value: stillActive.notes || 'None', inline: false }
          )
          .setTimestamp();

        let files = [];
        try {
          const guild = await client.guilds.fetch(stillActive.guildId);
          const member = await guild.members.fetch(stillActive.requesterId).catch(() => null);
          const card = await generateBountyCardImage(stillActive, member);
          if (card) {
            startEmbed.setImage(`attachment://${card.fileName}`);
            files.push({ attachment: card.filePath, name: card.fileName });
          }
        } catch (err) {
          console.error('❌ Failed to attach bounty card image:', err);
        }

        await bountyChannel.send({
          content: pingText || '',
          embeds: [startEmbed],
          files
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
            { name: 'Trainer', value: `<@${stillActive.requesterId}>`, inline: true },
            { name: 'Rarity', value: rarityDisplay, inline: true },
            { name: 'Reward', value: `${stillActive.reward.toLocaleString()} PKD`, inline: false },
            { name: 'Pokémon Targets', value: pokemonListLines, inline: false },
            { name: 'Ended', value: `<t:${endUnix}:F>`, inline: false },
            { name: 'Duration', value: `${stillActive.durationHours} hour(s)`, inline: true },
            { name: 'Note', value: stillActive.notes || 'None', inline: false }
          )
          .setTimestamp();

        await bountyChannel.send({
          content: pingText || '',
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
      const pts = row?.points || 0;               // current spendable points
      const lifetime = row?.lifetime_points || 0; // historic
      const rankName = getRankName(lifetime);
      const value = pts * 200000;

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Gold")
            .setTitle("💰 Your Points & Rank")
            .addFields(
              { name: "Rank", value: rankName, inline: true },
              { name: "Lifetime Points", value: `${lifetime} points`, inline: true },
              { name: "Current Points", value: String(pts), inline: true },
              { name: "PKD Value (Current)", value: value.toLocaleString() + " pkd", inline: false }
            )
        ],
        ephemeral: true
      });
    }

    if (commandName === "leaderboard") {
      const rows = await db.getLeaderboard(10);
      if (rows.length === 0) return interaction.reply({ content: "No data yet.", ephemeral: true });

      const guild = interaction.guild;
      const lines = [];

      for (let i = 0; i < rows.length; i++) {
        const u = rows[i];
        const lifetime = u.lifetime_points || 0;
        const rankName = getRankName(lifetime);

        let displayName = u.username || 'Unknown';
        if (u.discord_id) {
          const member = await guild.members.fetch(u.discord_id).catch(() => null);
          if (member) displayName = member.displayName;
        }

        lines.push(`**#${i + 1}** — ${displayName} — *${rankName}* — ${lifetime} points`);
      }

      const desc = lines.join('\n');

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Gold")
            .setTitle("🏆 Top Hunters (Lifetime)")
            .setDescription(desc)
        ]
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
        legendary: "Legendary / Rare",
        rare: "Legendary / Rare",
        common: "Common"
      }[rarity] || rarity;

      // Award points only if report is before :30
      const minutes = now.getMinutes();
      const basePoints = rarityPoints[rarity] || 10;
      let pointsAwarded = 0;
      let scoringNote = '';

      if (minutes <= 29) {
        const updatedRow = await awardPoints(user.id, user.username, basePoints, `Report: ${pokemon}`);
        pointsAwarded = basePoints;
        const lifetime = updatedRow?.lifetime_points || 0;
        const rankName = getRankName(lifetime);
        scoringNote = rankName;
      } else {
        scoringNote = 'Report after :30 — no points awarded.';
      }

      const embed = new EmbedBuilder()
        .setColor('Random')
        .setTitle(`🐾 Wild ${pokemon} spotted!`)
        .setDescription(
          `**${user.username}** has found a wild **${pokemon}**!\n` +
          `📍 Location: **${route}**\n` +
          `⏳ Available until **${expiryTime}**`
        )
        .addFields(
          { name: '📊 Rarity', value: rarityLabel, inline: true },
          { name: '🏆 Points Awarded', value: String(pointsAwarded), inline: true },
          { name: 'Scoring', value: scoringNote, inline: false }
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
      const notes = interaction.options.getString('notes'); // required in command
      const startTimeStr = interaction.options.getString('starttime');
      const durationHoursRaw = interaction.options.getInteger('duration');
      const reward = interaction.options.getInteger('reward');

      const pokemons = [pokemon1, pokemon2, pokemon3].filter(Boolean);
      const hour = parseHourFromStartTimeString(startTimeStr);
      const durationHours = clampHours(durationHoursRaw);
      const startTime = getNextOccurrenceOfHour(hour);
      const durationMs = durationHours * 60 * 60 * 1000;
      const endTime = new Date(startTime.getTime() + durationMs);

      const bountyId = `${Date.now()}_${interaction.user.id}`;
      const bounty = {
        id: bountyId,
        requesterId: interaction.user.id,
        requesterName: interaction.user.username,
        guildId: interaction.guild.id,
        pokemons,
        notes,
        startTime,
        endTime,
        durationHours,
        reward,
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

      const pokemonListLines = pokemons.map(p => `• ${p}`).join('\n');
      const startUnix = Math.floor(startTime.getTime() / 1000);
      const endUnix = Math.floor(endTime.getTime() / 1000);
      const bountyRarity = getHighestRarityForList(pokemons);
      const rarityDisplay = getRarityDisplayName(bountyRarity);

      const embed = new EmbedBuilder()
        .setTitle('📝 New Bounty Request')
        .setDescription('A new bounty has been requested and is awaiting staff approval.')
        .addFields(
          { name: 'Trainer', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Rarity', value: rarityDisplay, inline: true },
          { name: 'Reward', value: `${reward.toLocaleString()} PKD`, inline: false },
          { name: 'Pokémon Targets', value: pokemonListLines, inline: false },
          { name: 'Requested Start', value: `<t:${startUnix}:F>`, inline: false },
          { name: 'Requested End', value: `<t:${endUnix}:F>`, inline: false },
          { name: 'Duration', value: `${durationHours} hour(s)`, inline: true },
          { name: 'Note', value: notes, inline: false }
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

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
  ChannelType,
  AttachmentBuilder
} = require('discord.js');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const path = require('path');

const db = require('./database.cjs');
const { createBountyCard } = require('./cardRenderer.cjs');
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

/**
 * Get rank name from lifetime points.
 */
function getRankName(lifetime) {
  let rank = RANKS[0].name;
  for (const r of RANKS) {
    if (lifetime >= r.min) rank = r.name;
  }
  return rank;
}

// Nice display label for rarity keys
function getRarityDisplayLabel(key) {
  if (key === 'paradox') return 'Paradox';
  if (key === 'roamerMonth') return 'Roamer of the Month';
  if (key === 'legendary' || key === 'rare') return 'Legendary / Rare';
  return 'Common';
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
  if (str === 'now') return 0; // not used for now-case, but safe
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
      const rarityLabel = getRarityDisplayLabel(bountyRarity);

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
          { name: 'Rarity', value: rarityLabel, inline: true },
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

      // Scheduled announcement at start time (CARD-only embed)
      setTimeout(async () => {
        const stillActive = activeBounties.get(bountyId);
        if (!stillActive) return;

        try {
          // Fetch member for nickname & avatar
          const member = await bountyChannel.guild.members
            .fetch(stillActive.requesterId)
            .catch(() => null);
          const displayName = member?.displayName || stillActive.requesterName;
          const avatarUrl =
            member?.displayAvatarURL({ extension: 'png', size: 512 }) ||
            client.user.displayAvatarURL({ extension: 'png', size: 512 });

          // Rank from DB
          const userRow = await db.getUserById(stillActive.requesterId);
          const lifetime = userRow?.lifetime_points || 0;
          const rankName = getRankName(lifetime);

          const startLabel = stillActive.startTime.toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short'
          });
          const endLabel = stillActive.endTime.toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short'
          });
          const durationLabel = `${stillActive.durationHours} hour(s)`;
          const rarityDisplay = getRarityDisplayLabel(bountyRarity);
          const rewardLabel = `${stillActive.reward.toLocaleString()} PKD`;

          const cardPath = await createBountyCard({
            bountyId,
            username: displayName,
            rankName,
            rarityKey: bountyRarity,
            rarityLabel: rarityDisplay,
            pokemons: stillActive.pokemons || [],
            startLabel,
            endLabel,
            durationLabel,
            note: stillActive.notes || '',
            rewardLabel,
            avatarUrl
          });

          const fileName = path.basename(cardPath);
          const attachment = new AttachmentBuilder(cardPath, { name: fileName });

          const cardEmbed = new EmbedBuilder()
            .setColor('DarkButNotBlack')
            .setImage(`attachment://${fileName}`);

          await bountyChannel.send({
            content: pingText || '',
            embeds: [cardEmbed],
            files: [attachment]
            // components: [] // later: add Claim button row here
          }).catch(() => {});
        } catch (err) {
          console.error('❌ Failed to send bounty card:', err);
        }
      }, delayToStart);

      // Scheduled announcement at end time
      setTimeout(async () => {
        const stillActive = activeBounties.get(bountyId);
        if (!stillActive) return;
        activeBounties.delete(bountyId);

        const endUnix = Math.floor(stillActive.endTime.getTime() / 1000);
        const rarityDisplay = getRarityDisplayLabel(bountyRarity);
        const pokemonListLinesEnd = stillActive.pokemons.map(p => `• ${p}`).join('\n');

        const endEmbed = new EmbedBuilder()
          .setTitle('🏁 Bounty Finished')
          .setDescription('The bounty has ended. Submissions are now closed.')
          .addFields(
            { name: 'Trainer', value: `<@${stillActive.requesterId}>`, inline: true },
            { name: 'Rarity', value: rarityDisplay, inline: true },
            { name: 'Reward', value: `${stillActive.reward.toLocaleString()} PKD`, inline: false },
            { name: 'Pokémon Targets', value: pokemonListLinesEnd, inline: false },
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
        // (No longer used because starttime now has fixed choices,
        // but this block is harmless to leave.)
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
              { name: "Lifetime Points", value: String(lifetime), inline: true },
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

      let desc = rows.map((u, i) => {
        const lifetime = u.lifetime_points || 0;
        const current = u.points || 0;
        const rankName = getRankName(lifetime);
        return `**#${i + 1}** — ${u.username} — *${rankName}* — ${lifetime} lifetime pts (Current: ${current})`;
      }).join("\n");

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
        legendary: "Legendary",
        rare: "Rare",
        common: "Common"
      }[rarity] || rarity;

      const points = rarityPoints[rarity] || 10;
      const updatedRow = await awardPoints(user.id, user.username, points, `Report: ${pokemon}`);
      const lifetime = updatedRow?.lifetime_points || 0;
      const rankName = getRankName(lifetime);

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
          { name: '🏆 Points Awarded', value: String(points), inline: true },
          { name: 'Trainer Rank', value: rankName, inline: true }
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
      const notes = interaction.options.getString('notes'); // required now
      const startTimeStr = interaction.options.getString('starttime');
      const durationHoursRaw = interaction.options.getInteger('duration');
      const reward = interaction.options.getInteger('reward');

      const pokemons = [pokemon1, pokemon2, pokemon3].filter(Boolean);

      const durationHours = clampHours(durationHoursRaw);
      const durationMs = durationHours * 60 * 60 * 1000;

      let startTime;
      if (startTimeStr === 'now') {
        startTime = new Date();
      } else {
        const hour = parseHourFromStartTimeString(startTimeStr);
        startTime = getNextOccurrenceOfHour(hour);
      }
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
      const rarityLabel = getRarityDisplayLabel(bountyRarity);

      const startFieldValue =
        startTimeStr === 'now'
          ? `<t:${startUnix}:F> (Starts on approval)`
          : `<t:${startUnix}:F>`;

      const embed = new EmbedBuilder()
        .setTitle('📝 New Bounty Request')
        .setDescription('A new bounty has been requested and is awaiting staff approval.')
        .addFields(
          { name: 'Trainer', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Rarity', value: rarityLabel, inline: true },
          { name: 'Reward', value: `${reward.toLocaleString()} PKD`, inline: false },
          { name: 'Pokémon Targets', value: pokemonListLines, inline: false },
          { name: 'Requested Start', value: startFieldValue, inline: false },
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

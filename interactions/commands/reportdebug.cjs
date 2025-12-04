// interactions/commands/reportdebug.cjs

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const db = require("../../database.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { calculateAwardedPoints } = require("../../utils/scoring.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const {
  getChannelForRarity,
  getRoleForRarity
} = require("../../utils/reportChannelRouter.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: test the report card system")
    .addStringOption(o =>
      o
        .setName("pokemon")
        .setDescription("Pokémon name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(o =>
      o
        .setName("route")
        .setDescription("Route / Location")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(client, interaction) {
    const user = interaction.user;
    const member = interaction.member;
    const guild = interaction.guild;

    // STAFF ONLY
    if (!member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
      return interaction.reply({
        content: "⛔ Staff-only test command.",
        flags: 64
      });
    }

    await interaction.reply({
      content: "🎨 Rendering card...",
      flags: 64
    });

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");

    // ──────────────────────────────
    // RARITY + POINTS
    // ──────────────────────────────
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    const now = new Date();
    const points = calculateAwardedPoints(rarityKey, now);

    const updatedUser = await db.addPoints(
      user.id,
      user.username,
      points,
      `Debug Report: ${pokemon}`
    );

    const trainerRank = getRankName(updatedUser?.lifetime_points || 0);
    const trainerName =
      member.displayName ||
      member.nickname ||
      user.globalName ||
      user.username;

    // ──────────────────────────────
    // EXPIRY WINDOW
    // ──────────────────────────────
    const expiresAt = new Date(now);
    // Always end of current hour  :59:59.999
    expiresAt.setMinutes(59, 59, 999);
    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

    const reportId = `report_${Date.now()}_${user.id}`;

    // ──────────────────────────────
    // BUILD CARD IMAGE
    // ──────────────────────────────
    const cardPath = await createReportCard({
      trainerName,
      trainerRank,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      points,
      location: route,
      statusText: "Active"
    });

    // ──────────────────────────────
    // ROUTE TO CORRECT RARITY CHANNEL
    // ──────────────────────────────
    let targetChannel = null;
    let targetChannelId = null;

    // Try router first
    const routedChannelId = getChannelForRarity(rarityKey);

    if (routedChannelId) {
      targetChannel = await guild.channels
        .fetch(routedChannelId)
        .catch(() => null);
      targetChannelId = routedChannelId;
    }

    // Fallback: debug-only card channel
    if (!targetChannel && DEBUG_REPORT_CHANNEL_ID) {
      targetChannel = await guild.channels
        .fetch(DEBUG_REPORT_CHANNEL_ID)
        .catch(() => null);
      targetChannelId = DEBUG_REPORT_CHANNEL_ID;
    }

    if (!targetChannel) {
      return interaction.followUp({
        content:
          "❌ No valid report channel found. Please configure rarity channels or REPORT_CARD_CHANNEL_ID.",
        flags: 64
      });
    }

    // Role ping from router (if configured)
    const roleId = getRoleForRarity(rarityKey);
    const mentions = [`<@${user.id}>`];
    if (roleId) mentions.push(`<@&${roleId}>`);

    // ──────────────────────────────
    // BUTTONS (Edit / Delete)
    // ──────────────────────────────
    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`reportedit_${reportId}`)
        .setLabel("✏ Edit")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`reportdelete_${reportId}`)
        .setLabel("🗑 Delete")
        .setStyle(ButtonStyle.Danger)
    );

    // ──────────────────────────────
    // SEND CARD MESSAGE
    // ──────────────────────────────
    const sent = await targetChannel.send({
      content: mentions.join(" "),
      files: [cardPath],
      components: [controls]
    });

    // ──────────────────────────────
    // DB SAVE
    // ──────────────────────────────
    await db.createReport({
      id: reportId,
      guildId: guild.id,
      reporterId: user.id,
      reporterName: trainerName,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      location: route,
      trainerRank,
      points,
      status: "active",
      channelId: sent.channelId,
      messageId: sent.id,
      imagePath: cardPath,
      expiresAt: expiresAt.getTime(),
      deleteAt,
      createdAt: now.getTime()
    });

    // ──────────────────────────────
    // CONFIRMATION BACK TO STAFF
    // ──────────────────────────────
    return interaction.followUp({
      content: `☑ Report card posted in <#${targetChannelId}> — expires **${expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}**`,
      flags: 64
    });
  }
};
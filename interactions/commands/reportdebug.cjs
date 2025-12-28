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

// 🔧 DEBUG RENDERER (NOT LIVE)
const { createReportCard } = require("../../renderers/reportCard.debug.cjs");

const {
  getChannelForRarity,
  getRoleForRarity
} = require("../../utils/reportChannelRouter.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: test the report card system (debug renderer)")
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
    )
    .addStringOption(o =>
      o
        .setName("mode")
        .setDescription("Debug mode")
        .setRequired(false)
        .addChoices(
          { name: "Encounter (self)", value: "encounter" },
          { name: "Sighting (other IGN)", value: "sighting" }
        )
    ),

  async execute(client, interaction) {
    const user = interaction.user;
    const member = interaction.member;
    const guild = interaction.guild;

    // ──────────────────────────────
    // STAFF ONLY
    // ──────────────────────────────
    if (!member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
      return interaction.reply({
        content: "⛔ Staff-only test command.",
        flags: 64
      });
    }

    await interaction.reply({
      content: "🎨 Rendering debug report card...",
      flags: 64
    });

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");
    const mode = interaction.options.getString("mode") || "encounter";

    // ──────────────────────────────
    // RARITY + POINTS
    // ──────────────────────────────
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    const now = new Date();

    // Debug: full points for encounter, half for sighting
    const basePoints = calculateAwardedPoints(rarityKey, now);
    const points =
      mode === "sighting" ? Math.floor(basePoints * 0.5) : basePoints;

    const updatedUser = await db.addPoints(
      user.id,
      user.username,
      points,
      `Debug ${mode} report: ${pokemon}`
    );

    const trainerRank = getRankName(updatedUser?.lifetime_points || 0);

    const reporterName =
      member.displayName ||
      member.nickname ||
      user.globalName ||
      user.username;

    // ──────────────────────────────
    // DEBUG ENCOUNTERER SETUP
    // ──────────────────────────────
    let reportType;
    let encountererName;
    let encountererType;

    if (mode === "sighting") {
      reportType = "sighting";
      encountererName = "TestIGN_Player";
      encountererType = "ign";
    } else {
      reportType = "encounter";
      encountererName = reporterName;
      encountererType = "discord";
    }

    // ──────────────────────────────
    // EXPIRY WINDOW
    // ──────────────────────────────
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);
    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

    const reportId = `report_${Date.now()}_${user.id}`;

    // ──────────────────────────────
    // BUILD DEBUG CARD IMAGE
    // ──────────────────────────────
    const cardPath = await createReportCard({
      reportType,

      reporterName,
      reporterType: "discord",

      encountererName,
      encountererType,

      pokemonName: pokemon,
      location: route,

      rarityKey,
      rarityLabel,
      points,
      trainerRank,

      statusText: "Active"
    });

    // ──────────────────────────────
    // ROUTE TO CHANNEL
    // ──────────────────────────────
    let targetChannel = null;
    let targetChannelId = null;

    const routedChannelId = getChannelForRarity(rarityKey);
    if (routedChannelId) {
      targetChannel = await guild.channels
        .fetch(routedChannelId)
        .catch(() => null);
      targetChannelId = routedChannelId;
    }

    if (!targetChannel && DEBUG_REPORT_CHANNEL_ID) {
      targetChannel = await guild.channels
        .fetch(DEBUG_REPORT_CHANNEL_ID)
        .catch(() => null);
      targetChannelId = DEBUG_REPORT_CHANNEL_ID;
    }

    if (!targetChannel) {
      return interaction.followUp({
        content:
          "❌ No valid report channel found. Check REPORT_CARD_CHANNEL_ID.",
        flags: 64
      });
    }

    const roleId = getRoleForRarity(rarityKey);
    const mentions = [`<@${user.id}>`];
    if (roleId) mentions.push(`<@&${roleId}>`);

    // ──────────────────────────────
    // BUTTONS
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
    // SEND MESSAGE
    // ──────────────────────────────
    const sent = await targetChannel.send({
      content: mentions.join(" "),
      files: [cardPath],
      components: [controls]
    });

    // ──────────────────────────────
    // DB SAVE (DEBUG SAFE)
    // ──────────────────────────────
    await db.createReport({
      id: reportId,
      guildId: guild.id,
      reporterId: user.id,
      reporterName: reporterName,
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
    // CONFIRMATION
    // ──────────────────────────────
    return interaction.followUp({
      content: `☑ Debug **${reportType}** report posted in <#${targetChannelId}> — expires **${expiresAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })}**`,
      flags: 64
    });
  }
};
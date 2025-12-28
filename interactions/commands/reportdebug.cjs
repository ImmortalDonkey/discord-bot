// interactions/commands/reportdebug.cjs

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const db = require("../../database.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const {
  getChannelForRarity,
  getRoleForRarity
} = require("../../utils/reportChannelRouter.cjs");

// 🔧 DEBUG ENGINE (NEW)
const {
  executeDebugReport
} = require("../../utils/reportEngine.debug.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: test the report system (encounter/sighting)")
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
        .setName("id_or_ign")
        .setDescription("Pokémon ID (#12345) for encounter OR IGN for sighting")
        .setRequired(true)
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
      content: "🔍 Processing report...",
      flags: 64
    });

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");
    const idOrIgn = interaction.options.getString("id_or_ign");

    // ──────────────────────────────
    // DEBUG REPORT ENGINE (ALL LOGIC)
    // ──────────────────────────────
    const result = await executeDebugReport({
      client,
      guild,
      reporterUser: user,
      reporterMember: member,
      pokemon,
      route,
      idOrIgn,
      now: new Date()
    });

    if (!result.ok) {
      return interaction.followUp({
        content: `❌ ${result.error}`,
        flags: 64
      });
    }

    // ──────────────────────────────
    // BUILD CARD IMAGE
    // ──────────────────────────────
    const reportId = `report_${Date.now()}_${user.id}`;

    const cardPath = await createReportCard({
      trainerName: result.narrativeText, // renderer will be updated later
      trainerRank: result.trainerRank,
      pokemonName: result.pokemonName,
      rarityKey: result.rarityKey,
      rarityLabel: result.rarityLabel,
      points: result.pointsAwarded,
      location: result.route,
      statusText: "Active"
    });

    // ──────────────────────────────
    // ROUTE TO CORRECT CHANNEL
    // ──────────────────────────────
    let targetChannel = null;
    let targetChannelId = null;

    const routedChannelId = getChannelForRarity(result.rarityKey);
    if (routedChannelId) {
      targetChannel = await guild.channels.fetch(routedChannelId).catch(() => null);
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
          "❌ No valid report channel found. Configure rarity channels or REPORT_CARD_CHANNEL_ID.",
        flags: 64
      });
    }

    // ──────────────────────────────
    // ROLE PINGS
    // ──────────────────────────────
    const roleId = getRoleForRarity(result.rarityKey);
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
    // DB SAVE
    // ──────────────────────────────
    await db.createReport({
      id: reportId,
      guildId: guild.id,
      reporterId: user.id,
      reporterName: user.username,
      pokemonName: result.pokemonName,
      rarityKey: result.rarityKey,
      rarityLabel: result.rarityLabel,
      location: result.route,
      trainerRank: result.trainerRank,
      points: result.pointsAwarded,
      status: "active",
      channelId: sent.channelId,
      messageId: sent.id,
      imagePath: cardPath,
      expiresAt: result.expiresAt,
      deleteAt: result.deleteAt,
      createdAt: Date.now()
    });

    // ──────────────────────────────
    // CONFIRMATION
    // ──────────────────────────────
    return interaction.followUp({
      content: `☑ Report processed and posted in <#${targetChannelId}>`,
      flags: 64
    });
  }
};
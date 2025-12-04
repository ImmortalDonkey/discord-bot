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

// 🔹 LIMITER IMPORT
const { checkReportAllowed } = require("../../utils/reportLimiter.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: test the report card system")
    .addStringOption(o =>
      o.setName("pokemon")
        .setDescription("Pokémon name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(o =>
      o.setName("route")
        .setDescription("Route / Location")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(client, interaction) {
    const user = interaction.user;
    const member = interaction.member;

    // STAFF ONLY
    if (!member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
      return interaction.reply({
        content: "⛔ Staff-only test command.",
        flags: 64
      });
    }

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");

    // 🔹 LIMITER ADDED BELOW — BEFORE ANYTHING ELSE
    const limit = await checkReportAllowed(pokemon);
    if (!limit.allowed) {
      const reset = limit.nextResetLabel || "later";

      // If a current report exists in DB, link it
      if (limit.activeReport) {
        const r = limit.activeReport;
        return interaction.reply({
          content:
            `⚠️ A report for **${pokemon}** is already active this hour!\n` +
            `🔗 Jump to card: https://discord.com/channels/${r.guildId}/${r.channelId}/${r.messageId}\n\n` +
            `Try again ${reset}.`,
          flags: 64
        });
      }

      return interaction.reply({
        content: `⚠️ Already reported this hour. Try again ${reset}.`,
        flags: 64
      });
    }
    // 🔹 END LIMIT CHECK

    await interaction.reply({
      content: "🎨 Rendering card...",
      flags: 64
    });

    // Rarity + Points Award
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    const now = new Date();
    const points = calculateAwardedPoints(rarityKey, now);
    const updated = await db.addPoints(
      user.id,
      user.username,
      points,
      `Debug Report: ${pokemon}`
    );

    const trainerRank = getRankName(updated?.lifetime_points || 0);
    const trainerName =
      member.displayName ||
      member.nickname ||
      user.globalName ||
      user.username;

    // Expiry logic — end of current hour
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);
    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

    const reportId = `report_${Date.now()}_${user.id}`;

    // CREATE IMAGE
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

    const debugChannel = client.channels.cache.get(DEBUG_REPORT_CHANNEL_ID);
    if (!debugChannel) {
      return interaction.followUp({
        content: `❌ Cannot access <#${DEBUG_REPORT_CHANNEL_ID}>`,
        flags: 64
      });
    }

    // BUTTONS
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

    const sent = await debugChannel.send({
      files: [cardPath],
      components: [controls]
    });

    await db.createReport({
      id: reportId,
      guildId: interaction.guild.id,
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

    return interaction.followUp({
      content: `☑ Debug posted — expires **${expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}**`,
      flags: 64
    });
  }
};
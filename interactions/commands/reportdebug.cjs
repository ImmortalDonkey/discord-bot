// interactions/commands/reportdebug.cjs
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const db = require("../../database.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { calculateAwardedPoints } = require("../../utils/scoring.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: test the report system with buttons + expiry")
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

    // Staff only
    if (!member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
      return interaction.reply({
        content: "⛔ Staff-only test command.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🎨 Rendering report preview...",
      ephemeral: true
    });

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");

    // Rarity
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // Points and rank update
    const now = new Date();
    const points = calculateAwardedPoints(rarityKey, now);
    const updated = await db.addPoints(user.id, user.username, points, `Debug Report: ${pokemon}`);

    const trainerRank = getRankName(updated?.lifetime_points || 0);
    const trainerName =
      member.displayName ||
      member.nickname ||
      user.globalName ||
      user.username;

    // Expiry times
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);

    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

    const reportId = `report_${Date.now()}_${user.id}`;

    // Render card image
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
        ephemeral: true
      });
    }

    // Buttons
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

    // Send message with image + controls
    const sent = await debugChannel.send({
      content: `🧪 **DEBUG REPORT** — expires: **${expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}**`,
      files: [cardPath],
      components: [controls]
    });

    // Insert DB row
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
      content: `☑ Debug card posted in <#${DEBUG_REPORT_CHANNEL_ID}>`,
      ephemeral: true
    });
  }
};

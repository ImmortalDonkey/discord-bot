// interactions/commands/reportdebug.cjs
const { SlashCommandBuilder } = require("discord.js");

const db = require("../../database.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { calculateAwardedPoints } = require("../../utils/scoring.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: test the report card renderer + scheduling")
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

    // Permission check
    if (!interaction.member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
      return interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🛠 Generating debug report card…",
      ephemeral: true
    });

    // Display name logic
    const member = interaction.member;
    const trainerName =
      member?.displayName ||
      member?.nickname ||
      user.globalName ||
      user.username ||
      user.tag;

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");
    const now = new Date();

    // Rarity
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // Points + rank update
    const awarded = calculateAwardedPoints(rarityKey, now);
    const updated = await db.addPoints(
      user.id,
      user.username,
      awarded,
      `Debug Report: ${pokemon}`
    );
    const lifetime = updated?.lifetime_points ?? 0;
    const trainerRank = getRankName(lifetime);

    // Status always Active for new reports
    const statusText = "Active";

    // SCHEDULING LOGIC 🌙
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);

    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000; // +24h

    // Unique ID used for DB + scheduler
    const reportId = `report_${Date.now()}_${user.id}`;

    // Render card
    const cardPath = await createReportCard({
      trainerName,
      trainerRank,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      points: awarded,
      location: route,
      statusText
    });

    const channel = client.channels.cache.get(REPORT_CHANNEL_ID);
    if (!channel) {
      return interaction.followUp({
        content: `❌ Channel <#${REPORT_CHANNEL_ID}> not found.`,
        ephemeral: true
      });
    }

    // Send card
    const sent = await channel.send({
      content:
        `🛠 **DEBUG CARD** (expires at: ${expiresAt.toLocaleTimeString()})`,
      files: [cardPath]
    });

    // Store DB row for scheduler
    await db.createReport({
      id: reportId,
      guildId: interaction.guildId,
      reporterId: user.id,
      reporterName: trainerName,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      location: route,
      status: "active",
      messageId: sent.id,
      channelId: sent.channelId,
      expiresAt: expiresAt.getTime(),
      deleteAt,
      createdAt: now.getTime(),
      imagePath: cardPath
    });

    return interaction.followUp({
      content: `✅ Debug card posted — **Expires at ${expiresAt.toLocaleTimeString()}**`,
      ephemeral: true
    });
  }
};

// interactions/commands/report.cjs
// LIVE manual report — mirrors /reportdebug exactly
// ONLY difference: no staff-only restriction

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { calculateAwardedPoints } = require("../../utils/scoring.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");

const { createReportCard } = require("../../renderers/reportCard.cjs");
const { dispatchReport } = require("../../utils/reportDispatcher.cjs");

const MAIN_GUILD_ID = process.env.GUILD_ID;

/**
 * EXACT nickname logic (MUST MATCH /reportdebug)
 */
function resolveDisplayName(member, user) {
  return (
    member?.displayName ||
    member?.nickname ||
    user?.globalName ||
    user?.username
  );
}

module.exports = {
  // 🌍 SUBSCRIBER SAFE
  subscriberSafe: true,

  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("Report a wild Pokémon sighting")
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
    const { user, member, guild } = interaction;

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");

    // ──────────────────────────────
    // DUPLICATE VALIDATION (DB-BACKED)
    // ──────────────────────────────
    const existing = await db.findActiveReportThisHour(pokemon, Date.now());

    if (existing) {
      return interaction.reply({
        content: `⚠ A report for **${pokemon}** already exists this hour.`,
        flags: 64
      });
    }

    await interaction.reply({
      content: "🎨 Rendering report card…",
      flags: 64
    });

    // ──────────────────────────────
    // RARITY
    // ──────────────────────────────
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // ──────────────────────────────
    // IGN RESOLUTION (PRIMARY ID)
    // ──────────────────────────────
    const player = await db.getPlayerByDiscordId(user.id);
    const hasIgn = !!player?.ign;

    const displayName = hasIgn
      ? player.ign
      : resolveDisplayName(member, user);

    const displayType = hasIgn ? "ign" : "discord";

    // ──────────────────────────────
    // POINTS (IGN REQUIRED)
    // ──────────────────────────────
    const now = new Date();
    const basePoints = calculateAwardedPoints(rarityKey, now);

    let awardedPoints = 0;
    let trainerRank = "Unranked";

    if (hasIgn) {
      const updated = await db.addPoints(
        user.id,
        user.username,
        basePoints,
        `Report: ${pokemon}`
      );

      awardedPoints = basePoints;
      trainerRank = getRankName(updated?.lifetime_points || 0);
    }

    // ──────────────────────────────
    // REPORT CARD PREFS
    // ──────────────────────────────
    const reportCardPrefs = await db.getReportCardPrefs(user.id);

    // ──────────────────────────────
    // EXPIRY WINDOW (END OF CURRENT HOUR)
    // ──────────────────────────────
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);

    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;
    const reportId = `report_${Date.now()}_${user.id}`;

    // ──────────────────────────────
    // RENDER CARD
    // ──────────────────────────────
    const cardPath = await createReportCard({
      narrativeType: "manual",
      reporterName: displayName,
      reporterType: displayType,
      pokemonName: pokemon,
      location: route,
      rarityKey,
      rarityLabel,
      points: awardedPoints,
      trainerRank,
      statusText: "Active",
      reportCardPrefs
    });

    // ──────────────────────────────
    // CONTROLS
    // ──────────────────────────────
    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`reportedit_${reportId}`)
          .setLabel("✏ Edit")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`reportdelete_${reportId}`)
          .setLabel("🗑 Delete")
          .setStyle(ButtonStyle.Danger)
      )
    ];

    // ──────────────────────────────
    // CANONICAL REPORT (DB)
    // ──────────────────────────────
    await db.createReport({
      id: reportId,
      guildId: guild.id,
      reporterId: user.id,
      reporterName: displayName,
      trainerRank,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      location: route,
      status: "active",
      points: awardedPoints,
      expiresAt: expiresAt.getTime(),
      deleteAt,
      createdAt: now.getTime(),
      imagePath: cardPath
    });

    // ──────────────────────────────
    // DISPATCH (SINGLE ENTRY POINT)
    // ──────────────────────────────
    await dispatchReport({
      client,
      report: {
        id: reportId,
        guildId: MAIN_GUILD_ID,
        rarityKey,
        pokemonKey: pokemon
      },
      renderCard: async () => ({
        buffer: fs.readFileSync(cardPath),
        filename: path.basename(cardPath)
      }),
      components
    });

    // ──────────────────────────────
    // CONFIRMATION
    // ──────────────────────────────
    return interaction.followUp({
      content: hasIgn
        ? `✔ Report posted — **${awardedPoints} point(s)** awarded.`
        : `⚠ Report posted — **no points awarded** (IGN not registered).`,
      flags: 64
    });
  }
};
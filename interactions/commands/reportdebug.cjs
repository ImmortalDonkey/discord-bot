// interactions/commands/reportdebug.cjs

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

const { createReportCard } = require("../../renderers/reportCard.debug.cjs");
const { dispatchReport } = require("../../utils/reportDispatcher.cjs");

const STAFF_ROLES = (process.env.STAFF_ROLES || "").split(",");
const MAIN_GUILD_ID = process.env.GUILD_ID;

/**
 * EXACT nickname logic (MUST MATCH /report)
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
  // 🚫 MAIN GUILD ONLY
  mainGuildOnly: true,

  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: full manual report (points + routing)")
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

    // ──────────────────────────────
    // MAIN GUILD ONLY
    // ──────────────────────────────
    if (guild.id !== MAIN_GUILD_ID) {
      return interaction.reply({
        content: "❌ This command can only be used in the main server.",
        flags: 64
      });
    }

    // ──────────────────────────────
    // STAFF ONLY
    // ──────────────────────────────
    if (!member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
      return interaction.reply({
        content: "⛔ Staff-only command.",
        flags: 64
      });
    }

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");

    // ──────────────────────────────
    // DUPLICATE VALIDATION (DB-BACKED)
    // SAME RULE AS /report
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
    // POINTS (FULL LOGIC)
    // ──────────────────────────────
    const now = new Date();
    const awardedPoints = calculateAwardedPoints(rarityKey, now);

    let trainerRank = "Unranked";

    if (hasIgn) {
      const updated = await db.addPoints(
        user.id,
        user.username,
        awardedPoints,
        `Debug Report: ${pokemon}`
      );

      trainerRank = getRankName(updated?.lifetime_points || 0);
    }

    // ──────────────────────────────
    // REPORT CARD PREFS
    // ──────────────────────────────
    const reportCardPrefs = hasIgn
      ? await db.getReportCardPrefs(user.id)
      : null;

    // ──────────────────────────────
    // EXPIRY WINDOW (END OF CURRENT HOUR)
    // ──────────────────────────────
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);

    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;
    const reportId = `debug_${Date.now()}_${user.id}`;

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
        ? `✔ Debug report posted — **${awardedPoints} point(s)** awarded.`
        : `⚠ Debug report posted — **no points awarded** (IGN not registered).`,
      flags: 64
    });
  }
};
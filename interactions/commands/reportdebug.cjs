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
const { createReportCard } = require("../../renderers/reportCard.debug.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

/**
 * EXACT nickname logic copied from LIVE /report command
 * ⚠️ Do not “simplify” this — parity is intentional
 */
function resolveTrainerName(member, user) {
  return (
    member.displayName ||
    member.nickname ||
    user.globalName ||
    user.username
  );
}

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
    )
    .addStringOption(o =>
      o
        .setName("id")
        .setDescription("Encounter Pokémon ID (prefix with #)")
        .setRequired(false)
    )
    .addStringOption(o =>
      o
        .setName("ign")
        .setDescription("IGN for sighting report")
        .setRequired(false)
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

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");
    const idInput = interaction.options.getString("id");
    const ignInput = interaction.options.getString("ign");

    // ──────────────────────────────
    // VALIDATION: EXACTLY ONE OF ID / IGN
    // ──────────────────────────────
    if ((idInput && ignInput) || (!idInput && !ignInput)) {
      return interaction.reply({
        content: "❌ You must provide **either** an ID **or** an IGN (not both).",
        flags: 64
      });
    }

    // Single initial reply (prevents Unknown interaction)
    await interaction.reply({
      content: "🎨 Rendering debug report card...",
      flags: 64
    });

    // ──────────────────────────────
    // RARITY + BASE POINTS
    // ──────────────────────────────
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    const now = new Date();
    const basePoints = calculateAwardedPoints(rarityKey, now);

    let awardedPoints = basePoints;
    let reportType = "encounter";

    // ──────────────────────────────
    // NAME RESOLUTION (LIVE PARITY)
    // ──────────────────────────────
    const reporterName = resolveTrainerName(member, user);
    let encountererName = reporterName;
    let encountererType = "discord";
    let reporterType = "discord";

    // ──────────────────────────────
    // SIGHTING FLOW
    // ──────────────────────────────
    if (ignInput) {
      const ign = ignInput.trim();
      const foundPlayer = await db.getPlayerByIgn(ign);

      if (foundPlayer) {
        // Upgrade to encounter
        reportType = "encounter";
        encountererName =
          foundPlayer.nickname ||
          foundPlayer.username ||
          ign;
        encountererType = "discord";
      } else {
        // True sighting
        reportType = "sighting";
        encountererName = ign;
        encountererType = "ign";
        awardedPoints = Math.floor(basePoints * 0.5);
      }
    }

    // Explicit encounter via ID
    if (idInput) {
      reportType = "encounter";
    }

    // ──────────────────────────────
    // AWARD POINTS (DEBUG WRITES POINTS)
    // ──────────────────────────────
    const updatedUser = await db.addPoints(
      user.id,
      user.username,
      awardedPoints,
      `Debug Report (${reportType}): ${pokemon}`
    );

    const trainerRank = getRankName(updatedUser?.lifetime_points || 0);

    // ──────────────────────────────
    // EXPIRY WINDOW (MATCH LIVE)
    // ──────────────────────────────
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);
    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

    const reportId = `report_${Date.now()}_${user.id}`;

    // ──────────────────────────────
    // BUILD DEBUG CARD
    // ──────────────────────────────
    const cardPath = await createReportCard({
      reportType,
      reporterName,
      reporterType,
      encountererName,
      encountererType,
      pokemonName: pokemon,
      location: route,
      rarityKey,
      rarityLabel,
      points: awardedPoints,
      trainerRank,
      statusText: "Active"
    });

    // ──────────────────────────────
    // DEBUG CHANNEL ONLY (NO ROUTER)
    // ──────────────────────────────
    const targetChannel = await guild.channels
      .fetch(DEBUG_REPORT_CHANNEL_ID)
      .catch(() => null);

    if (!targetChannel) {
      return interaction.followUp({
        content: "❌ REPORT_CARD_CHANNEL_ID is not configured.",
        flags: 64
      });
    }

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
      content: `<@${user.id}>`,
      files: [cardPath],
      components: [controls]
    });

    // ──────────────────────────────
    // SAVE REPORT (LIVE SCHEMA)
    // ──────────────────────────────
    await db.createReport({
      id: reportId,
      guildId: guild.id,
      reporterId: user.id,
      reporterName,
      trainerRank,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      location: route,
      status: "active",
      messageId: sent.id,
      channelId: sent.channelId,
      points: awardedPoints,
      expiresAt: expiresAt.getTime(),
      deleteAt,
      createdAt: now.getTime(),
      imagePath: cardPath
    });

    // ──────────────────────────────
    // CONFIRMATION
    // ──────────────────────────────
    return interaction.followUp({
      content: `☑ Debug report posted — expires **${expiresAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })}**`,
      flags: 64
    });
  }
};
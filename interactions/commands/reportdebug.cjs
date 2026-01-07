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
 * ⚠️ Do not simplify — parity is intentional
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
    .addBooleanOption(o =>
      o
        .setName("expired")
        .setDescription("Render the card as expired (testing only)")
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
    const forceExpired = interaction.options.getBoolean("expired") === true;

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

    // ──────────────────────────────
    // IGN RESOLUTION
    // ──────────────────────────────
    const player = await db.getPlayerByDiscordId(user.id);

    const hasIgn = !!player?.ign;
    const displayName = hasIgn
      ? player.ign
      : resolveDisplayName(member, user);

    const displayType = hasIgn ? "ign" : "discord";

    // ──────────────────────────────
    // POINTS (ONLY IF IGN EXISTS)
    // ──────────────────────────────
    let awardedPoints = 0;
    let trainerRank = "Unranked";

    if (hasIgn && !forceExpired) {
      const updatedUser = await db.addPoints(
        user.id,
        user.username,
        basePoints,
        `Debug Report (auto): ${pokemon}`
      );

      awardedPoints = basePoints;
      trainerRank = getRankName(updatedUser?.lifetime_points || 0);
    }

    // ──────────────────────────────
    // REPORT CARD USER PREFS
    // ──────────────────────────────
    const reportCardPrefs = await db.getReportCardPrefs(user.id);

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
      narrativeType: "vortex",
      reporterName: displayName,
      reporterType: displayType,
      pokemonName: pokemon,
      location: route,
      rarityKey,
      rarityLabel,
      points: awardedPoints,
      trainerRank,
      statusText: forceExpired ? "Expired" : "Active",
      reportCardPrefs
    });

    // ──────────────────────────────
    // DEBUG CHANNEL (ORIGIN GUILD)
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
    // BUTTONS (disabled if expired)
    // ──────────────────────────────
    const components = forceExpired
      ? []
      : [
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
    // SEND TO ORIGIN GUILD
    // ──────────────────────────────
    const sent = await targetChannel.send({
      content: `<@${user.id}>`,
      files: [cardPath],
      components
    });

    // Track origin guild mapping
    await db.addReportMessageMapping({
      reportId,
      guildId: guild.id,
      channelId: sent.channelId,
      messageId: sent.id
    });

    // ──────────────────────────────
    // FAN-OUT TO OTHER KNOWN GUILDS
    // ──────────────────────────────
    const allGuildIds = await db.getAllKnownGuildIds();
    const targetGuildIds = allGuildIds.filter(id => id !== guild.id);

    for (const targetGuildId of targetGuildIds) {
      try {
        const targetGuild = await client.guilds.fetch(targetGuildId);
        if (!targetGuild) continue;

        const channel = await targetGuild.channels
          .fetch(DEBUG_REPORT_CHANNEL_ID)
          .catch(() => null);

        if (!channel) continue;

        const msg = await channel.send({
          content: `<@${user.id}>`,
          files: [cardPath],
          components
        });

        await db.addReportMessageMapping({
          reportId,
          guildId: targetGuild.id,
          channelId: msg.channelId,
          messageId: msg.id
        });
      } catch (err) {
        console.warn(
          `[reportdebug] Fan-out failed for guild ${targetGuildId}:`,
          err.message
        );
      }
    }

    // ──────────────────────────────
    // SAVE CANONICAL REPORT (ONCE)
    // ──────────────────────────────
    await db.createReport({
      id: reportId,
      guildId: guild.id, // origin guild only
      reporterId: user.id,
      reporterName: displayName,
      trainerRank,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      location: route,
      status: forceExpired ? "expired" : "active",
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
      content: forceExpired
        ? "☑ Debug report posted as **Expired** (fan-out enabled)."
        : hasIgn
          ? `☑ Debug report posted — **${awardedPoints} point(s)** awarded (fan-out enabled).`
          : `⚠ Debug report posted — **no points awarded** (IGN not registered, fan-out enabled).`,
      flags: 64
    });
  }
};

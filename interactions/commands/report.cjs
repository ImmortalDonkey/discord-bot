// interactions/commands/report.cjs

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

const {
  isValidPokemon,
  isValidLocation
} = require("../../utils/validation.cjs");

const REPORT_FALLBACK_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

/**
 * EXACT nickname logic (shared with reportdebug)
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
  // 🌍 SUBSCRIBER SAFE
  // Global command + instant main guild availability
  subscriberSafe: true,

  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("Report a wild Pokémon sighting")
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

    await interaction.reply({
      content: "🎨 Rendering report card...",
      flags: 64
    });

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");

    // ──────────────────────────────
    // 🔍 STRONG VALIDATION (LIVE ONLY)
    // ──────────────────────────────
    if (!isValidPokemon(pokemon)) {
      return interaction.followUp({
        content: `❌ **"${pokemon}"** is not a valid Pokémon.\nPlease select from the autocomplete list.`,
        flags: 64
      });
    }

    if (!isValidLocation(route)) {
      return interaction.followUp({
        content: `❌ **"${route}"** is not a valid Route.\nPlease select from the autocomplete list.`,
        flags: 64
      });
    }

    // ──────────────────────────────
    // 🧠 RARITY + BASE POINTS
    // ──────────────────────────────
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    const now = new Date();
    const basePoints = calculateAwardedPoints(rarityKey, now);

    // ──────────────────────────────
    // 🧾 IGN RESOLUTION (PRIMARY ID)
    // ──────────────────────────────
    const player = await db.getPlayerByDiscordId(user.id);

    const hasIgn = !!player?.ign;
    const displayName = hasIgn
      ? player.ign
      : resolveDisplayName(member, user);

    const displayType = hasIgn ? "ign" : "discord";

    // ──────────────────────────────
    // ⭐ POINTS (IGN REQUIRED)
    // ──────────────────────────────
    let awardedPoints = 0;
    let trainerRank = "Unranked";

    if (hasIgn) {
      const updatedUser = await db.addPoints(
        user.id,
        user.username,
        basePoints,
        `Report: ${pokemon}`
      );

      awardedPoints = basePoints;
      trainerRank = getRankName(updatedUser?.lifetime_points || 0);
    }

    // ──────────────────────────────
    // 🎨 REPORT CARD PREFS
    // ──────────────────────────────
    const reportCardPrefs = await db.getReportCardPrefs(user.id);

    // ──────────────────────────────
    // ⏱️ EXPIRY WINDOW (MATCH DEV + AUTO)
    // ──────────────────────────────
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);
    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

    const reportId = `report_${Date.now()}_${user.id}`;

    // ──────────────────────────────
    // 🖼️ BUILD LIVE CARD
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
    // 📍 CHANNEL ROUTING
    // ──────────────────────────────
    let targetChannel = null;
    let targetChannelId = null;

    const routedChannelId = getChannelForRarity(rarityKey);
    if (routedChannelId) {
      targetChannel = await guild.channels.fetch(routedChannelId).catch(() => null);
      targetChannelId = routedChannelId;
    }

    if (!targetChannel && REPORT_FALLBACK_CHANNEL_ID) {
      targetChannel = await guild.channels
        .fetch(REPORT_FALLBACK_CHANNEL_ID)
        .catch(() => null);
      targetChannelId = REPORT_FALLBACK_CHANNEL_ID;
    }

    if (!targetChannel) {
      return interaction.followUp({
        content:
          "❌ No valid report channel found. Configure rarity channels or REPORT_CARD_CHANNEL_ID.",
        flags: 64
      });
    }

    // ──────────────────────────────
    // 🔔 MENTIONS (USER + RARITY ROLE)
    // ──────────────────────────────
    const mentions = [`<@${user.id}>`];
    const rarityRoleId = getRoleForRarity(rarityKey);
    if (rarityRoleId) mentions.push(`<@&${rarityRoleId}>`);

    // ──────────────────────────────
    // 🎛️ CONTROLS
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
    // 📤 SEND MESSAGE
    // ──────────────────────────────
    const sent = await targetChannel.send({
      content: mentions.join(" "),
      files: [cardPath],
      components: [controls]
    });

    // ──────────────────────────────
    // 💾 SAVE REPORT
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
      messageId: sent.id,
      channelId: sent.channelId,
      points: awardedPoints,
      expiresAt: expiresAt.getTime(),
      deleteAt,
      createdAt: now.getTime(),
      imagePath: cardPath
    });

    // ──────────────────────────────
    // ✅ CONFIRMATION
    // ──────────────────────────────
    return interaction.followUp({
      content: hasIgn
        ? `✔ Report posted — **${awardedPoints} point(s)** awarded.`
        : `⚠ Report posted — **no points awarded** (IGN not registered).`,
      flags: 64
    });
  }
};

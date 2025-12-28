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
const {
  getChannelForRarity,
  getRoleForRarity
} = require("../../utils/reportChannelRouter.cjs");

const {
  classifyReportTarget,
  validateEncounterReport,
  validateSightingReport
} = require("../../utils/ignValidator.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: test report logic with IGN / Pokémon ID")
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
        .setName("target")
        .setDescription("Pokémon ID (#12345) or IGN")
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
      content: "🧪 Processing debug report...",
      flags: 64
    });

    // Track player-guild relationship (multi-server groundwork)
    await db.touchPlayerGuild(user.id, guild.id);

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");
    const targetInput = interaction.options.getString("target");

    // ──────────────────────────────
    // CLASSIFY TARGET (ID vs IGN)
    // ──────────────────────────────
    const target = classifyReportTarget(targetInput);

    let reportType = null; // "encounter" | "sighting"
    let encounterDiscordId = null;
    let encounterIgn = null;
    let narrativeText = null;
    let awardedMultiplier = 1.0;

    // ──────────────────────────────
    // ENCOUNTER FLOW (Pokémon ID)
    // ──────────────────────────────
    if (target.type === "pokemon-id") {
      const encounterCheck = await validateEncounterReport({
        reporterDiscordId: user.id
      });

      if (!encounterCheck.allowed) {
        return interaction.followUp({
          content: "❌ You must register your IGN using `/ign` before submitting an encounter report.",
          flags: 64
        });
      }

      reportType = "encounter";
      encounterDiscordId = user.id;
      encounterIgn = encounterCheck.ign;
      awardedMultiplier = 1.0;

      narrativeText = `${member.displayName} encountered a wild ${pokemon} on ${route}`;
    }

    // ──────────────────────────────
    // SIGHTING FLOW (IGN)
    // ──────────────────────────────
    if (target.type === "ign") {
      const sightingCheck = await validateSightingReport({
        ign: target.ign
      });

      if (!sightingCheck.allowed) {
        return interaction.followUp({
          content: "❌ Invalid sighting report.",
          flags: 64
        });
      }

      // Upgrade to encounter if IGN belongs to registered player
      if (sightingCheck.upgradedToEncounter) {
        reportType = "encounter";
        encounterDiscordId = sightingCheck.ownerProfile.discord_id;
        encounterIgn = sightingCheck.ownerProfile.ign;
        awardedMultiplier = 1.0;

        narrativeText =
          `${member.displayName} reported that ${encounterIgn} encountered a wild ${pokemon} on ${route}`;
      } else {
        reportType = "sighting";
        encounterDiscordId = null;
        encounterIgn = target.ign;
        awardedMultiplier = 0.5;

        narrativeText =
          `${member.displayName} reported a wild ${pokemon} sighting on ${route}`;
      }
    }

    // ──────────────────────────────
    // RARITY + POINTS
    // ──────────────────────────────
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    const now = new Date();
    const basePoints = calculateAwardedPoints(rarityKey, now);
    const awardedPoints = Math.floor(basePoints * awardedMultiplier);

    let trainerRank = "Trainer";

    if (encounterDiscordId) {
      const updatedUser = await db.addPoints(
        encounterDiscordId,
        encounterIgn,
        awardedPoints,
        `Debug ${reportType}: ${pokemon}`
      );

      trainerRank = getRankName(updatedUser?.lifetime_points || 0);
    }

    // ──────────────────────────────
    // EXPIRY WINDOW
    // ──────────────────────────────
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);
    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

    const reportId = `report_${Date.now()}_${user.id}`;

    // ──────────────────────────────
    // RENDER CARD
    // ──────────────────────────────
    const cardPath = await createReportCard({
      narrativeText,
      trainerRank,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      points: awardedPoints,
      location: route,
      statusText: reportType === "encounter" ? "Encounter" : "Sighting"
    });

    // ──────────────────────────────
    // ROUTE CHANNEL
    // ──────────────────────────────
    let targetChannel = null;
    let targetChannelId = null;

    const routedChannelId = getChannelForRarity(rarityKey);
    if (routedChannelId) {
      targetChannel = await guild.channels.fetch(routedChannelId).catch(() => null);
      targetChannelId = routedChannelId;
    }

    if (!targetChannel && DEBUG_REPORT_CHANNEL_ID) {
      targetChannel = await guild.channels.fetch(DEBUG_REPORT_CHANNEL_ID).catch(() => null);
      targetChannelId = DEBUG_REPORT_CHANNEL_ID;
    }

    if (!targetChannel) {
      return interaction.followUp({
        content: "❌ No valid report channel configured.",
        flags: 64
      });
    }

    const roleId = getRoleForRarity(rarityKey);
    const mentions = roleId ? [`<@&${roleId}>`] : [];

    // ──────────────────────────────
    // SEND MESSAGE
    // ──────────────────────────────
    const sent = await targetChannel.send({
      content: mentions.join(" "),
      files: [cardPath]
    });

    // ──────────────────────────────
    // DB SAVE
    // ──────────────────────────────
    await db.createReport({
      id: reportId,
      guildId: guild.id,
      reporterId: user.id,
      reporterName: member.displayName,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      location: route,
      trainerRank,
      points: awardedPoints,
      status: "active",
      channelId: sent.channelId,
      messageId: sent.id,
      imagePath: cardPath,
      expiresAt: expiresAt.getTime(),
      deleteAt,
      createdAt: now.getTime()
    });

    // ──────────────────────────────
    // CONFIRMATION (EPHEMERAL)
    // ──────────────────────────────
    return interaction.followUp({
      content:
        `✔ Debug ${reportType} report posted in <#${targetChannelId}> (${awardedPoints} pts)`,
      flags: 64
    });
  }
};
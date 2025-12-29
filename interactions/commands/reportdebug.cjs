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
const {
  getChannelForRarity,
  getRoleForRarity
} = require("../../utils/reportChannelRouter.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

/**
 * Resolve Discord display name using LIVE logic
 */
function getDiscordDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.member?.nickname ||
    interaction.user?.globalName ||
    interaction.user?.username
  );
}

/**
 * Decide grammar: on vs at
 */
function routePreposition(route) {
  return /\d$/.test(route?.trim()) ? "on" : "at";
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

    await interaction.reply({
      content: "🎨 Rendering debug report card...",
      flags: 64
    });

    // ──────────────────────────────
    // RARITY + POINTS
    // ──────────────────────────────
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    const now = new Date();
    const basePoints = calculateAwardedPoints(rarityKey, now);

    // Encounter = 100%, Sighting = 50%
    let awardedPoints = basePoints;
    let reportType = "encounter";

    // ──────────────────────────────
    // NAME RESOLUTION
    // ──────────────────────────────
    const reporterName = getDiscordDisplayName(interaction);

    let encountererName = reporterName;
    let encountererType = "discord";
    let reporterType = "discord";

    // SIGHTING FLOW
    if (ignInput) {
      const ign = ignInput.trim();
      const foundPlayer = await db.getPlayerByIgn(ign);

      if (foundPlayer) {
        // UPGRADE TO ENCOUNTER
        reportType = "encounter";
        encountererName =
          foundPlayer.nickname ||
          foundPlayer.username ||
          ign;
        encountererType = "discord";
      } else {
        // TRUE SIGHTING
        reportType = "sighting";
        encountererName = ign;
        encountererType = "ign";
        awardedPoints = Math.floor(basePoints * 0.5);
      }
    }

    // ID FLOW (explicit encounter)
    if (idInput) {
      reportType = "encounter";
    }

    // ──────────────────────────────
    // AWARD POINTS (DEBUG STILL WRITES)
    // ──────────────────────────────
    const updatedUser = await db.addPoints(
      user.id,
      user.username,
      awardedPoints,
      `Debug Report (${reportType}): ${pokemon}`
    );

    const trainerRank = getRankName(updatedUser?.lifetime_points || 0);

    // ──────────────────────────────
    // EXPIRY WINDOW
    // ──────────────────────────────
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);
    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

    const reportId = `report_${Date.now()}_${user.id}`;

    // ──────────────────────────────
    // BUILD CARD IMAGE (DEBUG RENDERER)
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
    // ROUTE TO CHANNEL
    // ──────────────────────────────
    let targetChannel = null;
    let targetChannelId = null;

    const routedChannelId = getChannelForRarity(rarityKey);

    if (routedChannelId) {
      targetChannel = await guild.channels
        .fetch(routedChannelId)
        .catch(() => null);
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
        content: "❌ No valid report channel configured.",
        flags: 64
      });
    }

    // Role ping
    const roleId = getRoleForRarity(rarityKey);
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
    // SAVE REPORT (MATCHES LIVE SCHEMA)
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
      content: `☑ Debug report posted in <#${targetChannelId}> — expires **${expiresAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })}**`,
      flags: 64
    });
  }
};
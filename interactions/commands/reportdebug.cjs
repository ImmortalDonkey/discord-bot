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
const { getReportRouting } = require("../../utils/reportChannelRouter.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];

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
      o.setName("pokemon").setDescription("Pokémon name").setRequired(true).setAutocomplete(true)
    )
    .addStringOption(o =>
      o.setName("route").setDescription("Route / Location").setRequired(true).setAutocomplete(true)
    )
    .addBooleanOption(o =>
      o.setName("expired").setDescription("Render the card as expired (testing only)")
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
        `Debug Report: ${pokemon}`
      );

      awardedPoints = basePoints;
      trainerRank = getRankName(updatedUser?.lifetime_points || 0);
    }

    // ──────────────────────────────
    // REPORT CARD PREFS
    // ──────────────────────────────
    const reportCardPrefs = await db.getReportCardPrefs(user.id);

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

    const components = forceExpired
      ? []
      : [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`reportedit_${reportId}`)
              .setLabel("Edit")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`reportdelete_${reportId}`)
              .setLabel("Delete")
              .setStyle(ButtonStyle.Danger)
          )
        ];

    // ──────────────────────────────
    // ORIGIN GUILD ROUTING (UTIL)
    // ──────────────────────────────
    const originRouting = await getReportRouting({
      guildId: guild.id,
      rarityKey,
      currentChannelId: interaction.channelId
    });

    const originChannel = await guild.channels
      .fetch(originRouting.channelId)
      .catch(() => null);

    if (!originChannel) {
      return interaction.followUp({
        content: "❌ Failed to resolve report channel via router.",
        flags: 64
      });
    }

    const sent = await originChannel.send({
      content: `<@${user.id}>`,
      files: [cardPath],
      components
    });

    await db.addReportMessageMapping({
      reportId,
      guildId: guild.id,
      channelId: sent.channelId,
      messageId: sent.id
    });

    // ──────────────────────────────
    // FAN-OUT → SUBSCRIBER GUILDS ONLY
    // ──────────────────────────────
    const subscribers = await db.getSubscriberGuilds();

    for (const sub of subscribers) {
      if (sub.guild_id === guild.id) continue;

      try {
        const g = await client.guilds.fetch(sub.guild_id);
        const ch = await g.channels.fetch(sub.report_channel_id);

        const msg = await ch.send({
          content: `<@${user.id}>`,
          files: [cardPath],
          components
        });

        await db.addReportMessageMapping({
          reportId,
          guildId: g.id,
          channelId: msg.channelId,
          messageId: msg.id
        });
      } catch (err) {
        console.warn(
          `[reportdebug] Fan-out failed for guild ${sub.guild_id}:`,
          err.message
        );
      }
    }

    // ──────────────────────────────
    // SAVE CANONICAL REPORT
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
      status: forceExpired ? "expired" : "active",
      messageId: sent.id,
      channelId: sent.channelId,
      points: awardedPoints,
      expiresAt: expiresAt.getTime(),
      deleteAt,
      createdAt: now.getTime(),
      imagePath: cardPath
    });

    return interaction.followUp({
      content: "☑ Debug report posted (router + subscriber fan-out active).",
      flags: 64
    });
  }
};

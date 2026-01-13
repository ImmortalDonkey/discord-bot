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
const { createReportCard } = require("../../renderers/reportCard.debug.cjs");
const { dispatchReport } = require("../../utils/reportDispatcher.cjs");

const STAFF_ROLES = (process.env.STAFF_ROLES || "")
  .split(",")
  .map(r => r.trim())
  .filter(Boolean);

const MAIN_GUILD_ID = process.env.GUILD_ID;

/**
 * EXACT nickname logic copied from LIVE /report
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
  // 🚫 NEVER GLOBAL
  // MAIN GUILD DEV COMMAND ONLY
  mainGuildOnly: true,

  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: test report cards + routing (no points)")
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
        .setDescription("Render the card as expired")
    ),

  async execute(client, interaction) {
    const { user, member, guild } = interaction;

    // ──────────────────────────────
    // MAIN GUILD ONLY (RUNTIME)
    // ──────────────────────────────
    if (guild.id !== MAIN_GUILD_ID) {
      return interaction.reply({
        content: "❌ This command can only be used in the main server.",
        ephemeral: true
      });
    }

    // ──────────────────────────────
    // STAFF ONLY
    // ──────────────────────────────
    if (!member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
      return interaction.reply({
        content: "⛔ Staff-only test command.",
        ephemeral: true
      });
    }

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");
    const forceExpired = interaction.options.getBoolean("expired") === true;

    await interaction.reply({
      content: "🎨 Rendering debug report card…",
      ephemeral: true
    });

    // ──────────────────────────────
    // RARITY
    // ──────────────────────────────
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // ──────────────────────────────
    // DISPLAY NAME (NO POINTS)
    // ──────────────────────────────
    const player = await db.getPlayerByDiscordId(user.id);
    const hasIgn = !!player?.ign;

    const displayName = hasIgn
      ? player.ign
      : resolveDisplayName(member, user);

    const displayType = hasIgn ? "ign" : "discord";

    // ──────────────────────────────
    // EXPIRY WINDOW (MATCH LIVE)
    // ──────────────────────────────
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMinutes(59, 59, 999);

    const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;
    const reportId = `debug_${Date.now()}_${user.id}`;

    // ──────────────────────────────
    // RENDER CARD
    // ──────────────────────────────
    const cardPath = await createReportCard({
      narrativeType: "debug",
      reporterName: displayName,
      reporterType: displayType,
      pokemonName: pokemon,
      location: route,
      rarityKey,
      rarityLabel,
      points: 0,
      trainerRank: "Debug",
      statusText: forceExpired ? "Expired" : "Active"
    });

    // ──────────────────────────────
    // BUTTONS
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
    // SAVE CANONICAL REPORT (ONCE)
    // ──────────────────────────────
    await db.createReport({
      id: reportId,
      guildId: guild.id, // ORIGIN GUILD (CRITICAL)
      reporterId: user.id,
      reporterName: displayName,
      trainerRank: "Debug",
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      location: route,
      status: forceExpired ? "expired" : "active",
      points: 0,
      expiresAt: expiresAt.getTime(),
      deleteAt,
      createdAt: now.getTime(),
      imagePath: cardPath
    });

    // ──────────────────────────────
    // DISPATCH (FAN-OUT)
    // ──────────────────────────────
    await dispatchReport({
      client,
      report: {
        id: reportId,
        guildId: guild.id, // 🔑 ORIGIN CONTROLS ROUTING
        rarityKey,
        pokemonKey: pokemon
      },
      renderCard: async () => ({
        buffer: fs.readFileSync(cardPath),
        filename: path.basename(cardPath)
      }),
      components
    });

    return interaction.followUp({
      content: "☑ Debug report dispatched globally (router verified).",
      ephemeral: true
    });
  }
};

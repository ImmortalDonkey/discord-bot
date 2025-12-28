// interactions/commands/reportdebug.cjs

const { SlashCommandBuilder } = require("discord.js");

const { runDebugReport } = require("../../utils/reportEngine.debug.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

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
    ),

  async execute(client, interaction) {
    // Immediate ephemeral acknowledgement
    await interaction.reply({
      content: "🎨 Rendering card...",
      flags: 64
    });

    // Run engine (handles staff gate, optional validation, optional limiter, db save)
    const result = await runDebugReport(client, interaction, {
      staffRoleIds: STAFF_ROLES,
      fallbackChannelId: DEBUG_REPORT_CHANNEL_ID,
      // Debug defaults:
      // - allowDuplicates uses env DEBUG_ALLOW_DUPLICATE_REPORTS (default false unless you set it)
      // - validateInputs uses env DEBUG_VALIDATE_REPORT_INPUTS (default true)
      reasonPrefix: "Debug Report"
    });

    if (!result.ok) {
      // If staff check failed, we already replied "Rendering card..." — follow up with error
      return interaction.followUp({
        content: result.errorMessage || "❌ Debug report failed.",
        flags: 64
      });
    }

    // Staff confirmation
    return interaction.followUp({
      content: `☑ Report card posted in <#${result.targetChannelId}> — expires **${result.expiresAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })}**`,
      flags: 64
    });
  }
};
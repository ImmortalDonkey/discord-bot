// interactions/modals/reportEditModal.cjs
/**
 * Placeholder for future functionality:
 * Allows editing an existing report (e.g., wrong Pokémon, wrong route).
 *
 * Custom ID format:
 *   reportedit_<reportId>
 */

module.exports = {
  // Must be an array for modalHandler.cjs
  ids: ["reportedit_"],

  async execute(client, interaction) {
    const customId = interaction.customId;
    const prefix = "reportedit_";
    const reportId = customId.startsWith(prefix)
      ? customId.substring(prefix.length)
      : customId;

    const newPokemon =
      interaction.fields.getTextInputValue("pokemon") || null;
    const newRoute =
      interaction.fields.getTextInputValue("route") || null;

    // This is only a placeholder — no live logic yet
    return interaction.reply({
      content:
        "✏️ **Report edit modal submitted**\n" +
        `Report ID: \`${reportId}\`\n\n` +
        `• Pokémon: **${newPokemon || "unchanged"}**\n` +
        `• Route: **${newRoute || "unchanged"}**\n\n` +
        "_❗ Editing reports is not yet implemented — this is only a placeholder._",
      flags: 64 // ephemeral
    });
  }
};

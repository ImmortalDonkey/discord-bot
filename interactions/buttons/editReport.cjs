// interactions/buttons/editReport.cjs
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");

const db = require("../../database.cjs");

module.exports = {
  ids: ["reportedit_"], // prefix match

  /**
   * Handles clicking an "Edit Report" button under an active card
   */
  async execute(client, interaction) {
    const customId = interaction.customId;
    const prefix = "reportedit_";
    const reportId = customId.startsWith(prefix)
      ? customId.substring(prefix.length)
      : customId;

    // Fetch report from DB
    const report = await db.getReportById(reportId);
    if (!report) {
      return interaction.reply({
        content: "❌ Report not found in the database.",
        ephemeral: true
      });
    }

    // Reporter check
    if (interaction.user.id !== report.reporterId) {
      return interaction.reply({
        content: "🚫 Only the original reporter can edit this report.",
        ephemeral: true
      });
    }

    // Build modal
    const modal = new ModalBuilder()
      .setCustomId(`reportedit_${reportId}`)
      .setTitle("Edit Report Details");

    const pokemonInput = new TextInputBuilder()
      .setCustomId("pokemon")
      .setLabel("Pokémon name (optional)")
      .setPlaceholder(report.pokemonName)
      .setRequired(false)
      .setStyle(TextInputStyle.Short);

    const routeInput = new TextInputBuilder()
      .setCustomId("route")
      .setLabel("Route (optional)")
      .setPlaceholder(report.location)
      .setRequired(false)
      .setStyle(TextInputStyle.Short);

    modal.addComponents(
      new ActionRowBuilder().addComponents(pokemonInput),
      new ActionRowBuilder().addComponents(routeInput)
    );

    return interaction.showModal(modal);
  }
};

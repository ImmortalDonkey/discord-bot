// interactions/buttons/editReport.cjs
// Handles edit/delete on active report cards

const db = require("../../database.cjs");
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");
const fs = require("fs");

module.exports = {
  ids: ["reportedit_", "reportdelete_"],

  async execute(client, interaction) {
    const customId = interaction.customId;

    let action = null;
    let reportId = null;

    if (customId.startsWith("reportedit_")) {
      action = "edit";
      reportId = customId.replace("reportedit_", "");
    } else if (customId.startsWith("reportdelete_")) {
      action = "delete";
      reportId = customId.replace("reportdelete_", "");
    } else {
      return;
    }

    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.reply({
        content: "❌ Report no longer exists.",
        ephemeral: true
      });
    }

    // Permission check
    if (interaction.user.id !== report.reporterId) {
      return interaction.reply({
        content: "⛔ Only the original reporter can modify this report.",
        ephemeral: true
      });
    }

    // DELETE
    if (action === "delete") {
      try {
        const channel = await client.channels.fetch(report.channel_id).catch(() => null);
        if (channel) {
          const message = await channel.messages.fetch(report.message_id).catch(() => null);
          if (message) await message.delete().catch(() => {});
        }

        if (report.image_path && fs.existsSync(report.image_path)) {
          fs.unlinkSync(report.image_path);
        }

        await db.deleteReport(reportId);

        return interaction.reply({
          content: "🗑 Report deleted successfully.",
          ephemeral: true
        });

      } catch (err) {
        console.error("❌ Delete error:", err);
        return interaction.reply({
          content: "❌ Could not delete report.",
          ephemeral: true
        });
      }
    }

    // EDIT → Show Modal
    if (action === "edit") {
      const modal = new ModalBuilder()
        .setCustomId(`reporteditmodal_${reportId}`)
        .setTitle("Edit Report");

      const pokemonInput = new TextInputBuilder()
        .setCustomId("pokemon")
        .setLabel("New Pokémon (optional)")
        .setPlaceholder(report.pokemon_name || "Keep current")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const routeInput = new TextInputBuilder()
        .setCustomId("route")
        .setLabel("New Route (optional)")
        .setPlaceholder(report.location || "Keep current")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(pokemonInput),
        new ActionRowBuilder().addComponents(routeInput)
      );

      return interaction.showModal(modal);
    }
  }
};

// interactions/buttons/editReport.cjs
// Handles:
//  - reportedit_<id>   → open edit modal
//  - reportdelete_<id> → hard delete report

const db = require("../../database.cjs");
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");

module.exports = {
  ids: ["reportedit_", "reportdelete_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    let action = null;
    let reportId = null;

    if (id.startsWith("reportedit_")) {
      action = "edit";
      reportId = id.replace("reportedit_", "");
    } else if (id.startsWith("reportdelete_")) {
      action = "delete";
      reportId = id.replace("reportdelete_", "");
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

    // Only original reporter can modify
    if (report.reporter_id !== interaction.user.id) {
      return interaction.reply({
        content: "⛔ Only the original reporter can modify this report.",
        ephemeral: true
      });
    }

    // ────────────────────────────────────────
    // DELETE REPORT
    // ────────────────────────────────────────
    if (action === "delete") {
      try {
        const channel = await client.channels.fetch(report.channel_id).catch(() => null);
        if (channel) {
          const msg = await channel.messages.fetch(report.message_id).catch(() => null);
          if (msg) await msg.delete().catch(() => {});
        }

        const fs = require("fs");
        if (report.image_path && fs.existsSync(report.image_path)) {
          fs.unlinkSync(report.image_path);
        }

        await db.deleteReport(reportId);

        return interaction.reply({
          content: "🗑 **Report deleted successfully.**",
          ephemeral: true
        });

      } catch (err) {
        console.error("❌ Delete error:", err);
        return interaction.reply({
          content: "❌ Failed to delete report.",
          ephemeral: true
        });
      }
    }

    // ────────────────────────────────────────
    // EDIT REPORT — OPEN MODAL
    // ────────────────────────────────────────
    if (action === "edit") {
      const modal = new ModalBuilder()
        .setCustomId(`reportedit_${reportId}`)
        .setTitle("Edit Report");

      const pokemonInput = new TextInputBuilder()
        .setCustomId("pokemon")
        .setLabel("New Pokémon (optional)")
        .setPlaceholder("Leave blank to keep current")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const routeInput = new TextInputBuilder()
        .setCustomId("route")
        .setLabel("New Route (optional)")
        .setPlaceholder("Leave blank to keep current")
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

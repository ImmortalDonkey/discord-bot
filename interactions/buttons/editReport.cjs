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

// Staff roles from env (same pattern as /editpoints, /claim, etc.)
const STAFF_ROLES = (process.env.STAFF_ROLES || "")
  .split(",")
  .map(r => r.trim())
  .filter(Boolean);

module.exports = {
  // Button IDs handled here
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

    // Always work with the normalised report object (camelCase fields)
    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.reply({
        content: "❌ Report no longer exists.",
        ephemeral: true
      });
    }

    // Permission: original reporter OR staff (STAFF_ROLES)
    const member = interaction.member;
    const isReporter = interaction.user.id === report.reporterId;
    const isStaff =
      !!member &&
      !!member.roles &&
      member.roles.cache.some(r => STAFF_ROLES.includes(r.id));

    if (!isReporter && !isStaff) {
      return interaction.reply({
        content: "⛔ Only the original reporter or staff can modify this report.",
        ephemeral: true
      });
    }

    // ─────────────────────────────────────────────
    // DELETE BRANCH
    // ─────────────────────────────────────────────
    if (action === "delete") {
      try {
        // Use normalised field names from database.cjs
        const channel = await client.channels.fetch(report.channelId).catch(() => null);
        if (channel) {
          const message = await channel.messages.fetch(report.messageId).catch(() => null);
          if (message) {
            await message.delete().catch(() => {});
          }
        }

        // Delete the local PNG (Discord keeps its own CDN copy if message still existed)
        if (report.imagePath && fs.existsSync(report.imagePath)) {
          fs.unlinkSync(report.imagePath);
        }

        // Remove row from DB
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

    // ─────────────────────────────────────────────
    // EDIT BRANCH → Show Modal
    // ─────────────────────────────────────────────
    if (action === "edit") {
      const modal = new ModalBuilder()
        .setCustomId(`reporteditmodal_${reportId}`)
        .setTitle("Edit Report");

      // Free-text, but validated later in reportEditModal.cjs against
      // the same lists as your /report autocomplete.
      const pokemonInput = new TextInputBuilder()
        .setCustomId("pokemon")
        .setLabel("New Pokémon (optional)")
        .setPlaceholder(report.pokemonName || "Keep current")
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
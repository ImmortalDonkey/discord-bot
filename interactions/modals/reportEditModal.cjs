// interactions/modals/reportEditModal.cjs
// Handles modal submit from "Edit Report"

const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { availableLocations } = require("../../utils/locations.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const fs = require("fs");

module.exports = {
  // Registration format required by modal loader
  ids: ["reporteditmodal_"],

  async execute(client, interaction) {
    const customId = interaction.customId;
    const reportId = customId.replace("reporteditmodal_", "");

    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.reply({
        content: "❌ This report no longer exists.",
        ephemeral: true
      });
    }

    // Permission → original reporter only
    if (interaction.user.id !== report.reporterId) {
      return interaction.reply({
        content: "⛔ Only the original reporter can edit this report.",
        ephemeral: true
      });
    }

    const newPokemon = interaction.fields.getTextInputValue("pokemon")?.trim();
    const newRoute = interaction.fields.getTextInputValue("route")?.trim();

    if (!newPokemon && !newRoute) {
      return interaction.reply({
        content: "⚠ You must change at least one field.",
        ephemeral: true
      });
    }

    // Validate route input against known locations
    if (newRoute &&
      !availableLocations.some(
        loc => loc.toLowerCase() === newRoute.toLowerCase()
      )
    ) {
      return interaction.reply({
        content: `❌ **${newRoute}** is not a valid location.\nPlease use autocomplete locations.`,
        ephemeral: true
      });
    }

    const patch = {};

    // Only change relevant fields — do not recalc points or trainer rank!
    if (newPokemon) {
      const rarityKey = getRarity(newPokemon);
      patch.pokemonName = newPokemon;
      patch.rarityKey = rarityKey;
      patch.rarityLabel = getRarityDisplayLabel(rarityKey);
    }

    if (newRoute) {
      patch.location = newRoute;
    }

    const updated = await db.updateReport(reportId, patch);

    // Re-render updated card only (no text!)
    const newCardPath = await createReportCard({
      trainerName: updated.reporterName,
      trainerRank: updated.trainerRank,
      pokemonName: updated.pokemonName,
      rarityKey: updated.rarityKey,
      rarityLabel: updated.rarityLabel,
      points: updated.points,
      location: updated.location,
      statusText: updated.status === "expired" ? "Expired" : "Active"
    });

    // Delete the old local file if exists
    if (report.imagePath && fs.existsSync(report.imagePath)) {
      fs.unlinkSync(report.imagePath);
    }

    await db.updateReport(reportId, { imagePath: newCardPath });

    // Edit Discord message — replace ONLY image
    try {
      const channel = await client.channels.fetch(updated.channelId);
      const msg = await channel.messages.fetch(updated.messageId);
      await msg.edit({ files: [newCardPath] });
    } catch (err) {
      console.error(`❌ Failed to update report card image:`, err);
    }

    return interaction.reply({
      content: "✏ Report updated successfully!",
      ephemeral: true
    });
  }
};
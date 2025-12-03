// interactions/modals/reportEditModal.cjs
const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { calculateAwardedPoints } = require("../../utils/scoring.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const fs = require("fs");

module.exports = {
  idPrefix: "reporteditmodal_",

  async execute(client, interaction, idSuffix) {
    const reportId = idSuffix;
    const report = await db.getReport(reportId);

    if (!report) {
      return interaction.reply({
        content: "❌ This report no longer exists.",
        flags: 64
      });
    }

    // Permission check again
    if (interaction.user.id !== report.reporterId) {
      return interaction.reply({
        content: "⛔ Only the original reporter can modify this report.",
        flags: 64
      });
    }

    const newPokemon = interaction.fields.getTextInputValue("pokemon")?.trim();
    const newRoute = interaction.fields.getTextInputValue("route")?.trim();

    if (!newPokemon && !newRoute) {
      return interaction.reply({
        content: "⚠ No changes entered.",
        flags: 64
      });
    }

    // Apply updates
    const updatedPatch = {};

    if (newPokemon) {
      const rarityKey = getRarity(newPokemon);
      updatedPatch.pokemonName = newPokemon;
      updatedPatch.rarityKey = rarityKey;
      updatedPatch.rarityLabel = getRarityDisplayLabel(rarityKey);
      updatedPatch.points = calculateAwardedPoints(rarityKey, new Date());
    }
    if (newRoute) updatedPatch.location = newRoute;

    const updated = await db.updateReport(reportId, updatedPatch);

    // Re-render card
    const newCardPath = await createReportCard({
      trainerName: updated.reporterName,
      trainerRank: updated.trainerRank || getRankName(updated.points || 0),
      pokemonName: updated.pokemonName,
      rarityKey: updated.rarityKey,
      rarityLabel: updated.rarityLabel,
      points: updated.points,
      location: updated.location,
      statusText: updated.status === "expired" ? "Expired" : "Active"
    });

    // Remove old image to avoid disk clutter
    if (report.imagePath && fs.existsSync(report.imagePath)) {
      fs.unlinkSync(report.imagePath);
    }

    // Update message in channel
    const channel = await client.channels.fetch(updated.channelId).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(updated.messageId).catch(() => null);
      if (msg) {
        await msg.edit({ files: [newCardPath] }).catch(() => {});
      }
    }

    // Save new image
    await db.updateReport(reportId, { imagePath: newCardPath });

    return interaction.reply({
      content: "✏ Report updated successfully!",
      flags: 64
    });
  }
};

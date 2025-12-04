// interactions/modals/reportEditModal.cjs

const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const { availableLocations } = require("../../utils/locations.cjs");
const fs = require("fs");

module.exports = {
  idPrefix: "reporteditmodal_",

  async execute(client, interaction, reportId) {

    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.reply({
        content: "❌ This report no longer exists.",
        ephemeral: true
      });
    }

    // Permission check
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
        content: "⚠ Please change at least one field.",
        ephemeral: true
      });
    }

    // Validate Route
    if (newRoute && !availableLocations.some(l => l.toLowerCase() === newRoute.toLowerCase())) {
      return interaction.reply({
        content: `❌ Invalid location: **${newRoute}**\n(Please use autocomplete suggestions)`,
        ephemeral: true
      });
    }

    const patch = {};

    if (newPokemon) {
      const rarityKey = getRarity(newPokemon);
      patch.pokemon_name = newPokemon;
      patch.rarity_key = rarityKey;
      patch.rarity_label = getRarityDisplayLabel(rarityKey);
      // 🚫 No points awarded again for edits
    }

    if (newRoute) {
      patch.location = newRoute;
    }

    const updated = await db.updateReport(reportId, patch);

    // Render updated card (status stays same)
    const statusText = updated.status === "expired" ? "Expired" : "Active";
    const newCardPath = await createReportCard({
      trainerName: updated.reporterName,
      trainerRank: updated.trainerRank, // Does not change here
      pokemonName: updated.pokemonName,
      rarityKey: updated.rarityKey,
      rarityLabel: updated.rarityLabel,
      points: updated.points,
      location: updated.location,
      statusText
    });

    // Replace image path in DB
    if (report.imagePath && fs.existsSync(report.imagePath)) {
      fs.unlinkSync(report.imagePath);
    }

    await db.updateReport(reportId, { image_path: newCardPath });

    // Edit only the file — no plaintext!
    try {
      const channel = await client.channels.fetch(updated.channelId);
      const msg = await channel.messages.fetch(updated.messageId);

      await msg.edit({
        files: [newCardPath]
      });

    } catch (err) {
      console.error("❌ Failed to update message:", err);
    }

    return interaction.reply({
      content: "✏ Report updated!",
      ephemeral: true
    });
  }
};
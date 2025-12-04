// interactions/modals/reportEditModal.cjs
const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { availableLocations } = require("../../utils/locations.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const fs = require("fs");

module.exports = {
  // This ensures the handler gets called for every modal ID that starts like this:
  ids: ["reporteditmodal_"],

  async execute(client, interaction) {
    // Must acknowledge immediately to prevent “Unknown interaction”
    await interaction.deferReply({ ephemeral: true });

    const customId = interaction.customId;
    const reportId = customId.replace("reporteditmodal_", "");

    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.editReply("❌ This report no longer exists.");
    }

    // Permissions — reporter only OR staff in future extension
    if (interaction.user.id !== report.reporterId) {
      return interaction.editReply("⛔ Only the original reporter can edit this report.");
    }

    // Extract user input
    const newPokemonRaw = interaction.fields.getTextInputValue("pokemon")?.trim();
    const newRouteRaw = interaction.fields.getTextInputValue("route")?.trim();

    const newPokemon = newPokemonRaw && newPokemonRaw.length ? newPokemonRaw : null;
    const newRoute = newRouteRaw && newRouteRaw.length ? newRouteRaw : null;

    if (!newPokemon && !newRoute) {
      return interaction.editReply("⚠ Please change at least one field.");
    }

    // ROUTE VALIDATION (case-insensitive)
    if (
      newRoute &&
      !availableLocations.some(
        loc => loc.toLowerCase() === newRoute.toLowerCase()
      )
    ) {
      return interaction.editReply(
        `❌ Invalid location: **${newRoute}**\n` +
        "Please use one of the autocomplete suggestions."
      );
    }

    // Build update patch using proper camelCase fields
    const patch = {};

    if (newPokemon) {
      const rarityKey = getRarity(newPokemon);
      patch.pokemonName = newPokemon;
      patch.rarityKey = rarityKey;
      patch.rarityLabel = getRarityDisplayLabel(rarityKey);
      // No points change on edit (intentional)
    }

    if (newRoute) {
      patch.location = newRoute;
    }

    // Save update to DB
    const updated = await db.updateReport(reportId, patch);

    // Re-render report card with **updated** info
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

    // Remove old image file
    if (report.imagePath && fs.existsSync(report.imagePath)) {
      fs.unlinkSync(report.imagePath);
    }

    // Update new image path in DB
    await db.updateReport(reportId, {
      imagePath: newCardPath
    });

    // Update message in Discord
    try {
      const channel = await client.channels.fetch(updated.channelId);
      const msg = await channel.messages.fetch(updated.messageId);

      await msg.edit({
        files: [newCardPath]
      });

    } catch (err) {
      console.error("❌ Failed to update message:", err);
      return interaction.editReply("⚠ Card updated in database, but Discord message failed to update.");
    }

    return interaction.editReply("✏ Report updated successfully!");
  }
};
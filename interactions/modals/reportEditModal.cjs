// interactions/modals/reportEditModal.cjs
const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { calculateAwardedPoints } = require("../../utils/scoring.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const fs = require("fs");

module.exports = {
  idPrefix: "reporteditmodal_",  // 🔹 modal handler uses its own prefix

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

    // Build DB update data (snake_case db schema!)
    let patch = {};

    if (newPokemon) {
      const rarityKey = getRarity(newPokemon);
      patch.pokemon_name = newPokemon;
      patch.rarity_key = rarityKey;
      patch.rarity_label = getRarityDisplayLabel(rarityKey);
      patch.points = calculateAwardedPoints(rarityKey, new Date());
      patch.trainer_rank = getRankName(patch.points);
    }

    if (newRoute) {
      patch.location = newRoute;
    }

    const updated = await db.updateReport(reportId, patch);

    // Render updated card
    const newCardPath = await createReportCard({
      trainerName: updated.reporterName,
      trainerRank: updated.trainerRank,
      pokemonName: updated.pokemonName,
      rarityKey: updated.rarityKey,
      rarityLabel: updated.rarityLabel,
      points: updated.points,
      location: updated.location,
      statusText: updated.status === "expired" ? "Expired" : "Active",
    });

    // Delete previous card image if exists
    if (report.imagePath && fs.existsSync(report.imagePath)) {
      fs.unlinkSync(report.imagePath);
    }

    // Update database with new image path
    await db.updateReport(reportId, { image_path: newCardPath });

    // Edit the message in Discord
    try {
      const channel = await client.channels.fetch(updated.channelId);
      const msg = await channel.messages.fetch(updated.messageId);

      await msg.edit({
        content: `🕵️ **Report Updated:** ${updated.pokemonName} — ${updated.location}`,
        files: [newCardPath]
      });

    } catch (err) {
      console.error("❌ Failed to update message:", err);
    }

    return interaction.reply({
      content: "✏ Report successfully updated!",
      ephemeral: true
    });
  }
};

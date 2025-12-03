// interactions/modals/reportEditModal.cjs
/**
 * Handles editing an existing Report Card
 */

const db = require("../../database.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");

module.exports = {
  ids: ["reportedit_"],

  async execute(client, interaction) {
    const customId = interaction.customId;
    const prefix = "reportedit_";
    const reportId = customId.replace(prefix, "");

    const newPokemonRaw = interaction.fields.getTextInputValue("pokemon")?.trim();
    const newRouteRaw = interaction.fields.getTextInputValue("route")?.trim();

    const newPokemon = newPokemonRaw || null;
    const newRoute = newRouteRaw || null;

    if (!newPokemon && !newRoute) {
      return interaction.reply({
        content: "⚠️ You must update **at least one** field.",
        ephemeral: true
      });
    }

    // Fetch report
    const report = await db.getReportById(reportId);
    if (!report) {
      return interaction.reply({
        content: "❌ Report not found in database.",
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

    // Recompute rarity ONLY if Pokémon changes
    let newRarityKey = report.rarityKey;
    let newRarityLabel = report.rarityLabel;

    if (newPokemon) {
      newRarityKey = getRarity(newPokemon);
      newRarityLabel = getRarityDisplayLabel(newRarityKey);
    }

    // Build new patch object
    const patch = {
      pokemonName: newPokemon || report.pokemonName,
      rarityKey: newRarityKey,
      rarityLabel: newRarityLabel,
      location: newRoute || report.location
    };

    // Update DB
    await db.updateReport(report.id, patch);

    // Re-fetch updated row
    const updated = await db.getReportById(reportId);

    // Re-render updated card
    const cardPath = await createReportCard({
      trainerName: updated.reporterName,
      trainerRank: updated.trainerRank ?? getRankName(updated.points),
      pokemonName: updated.pokemonName,
      rarityKey: updated.rarityKey,
      rarityLabel: updated.rarityLabel,
      points: updated.points,
      location: updated.location,
      statusText: updated.status
    });

    // Edit original message
    try {
      const channel = await client.channels.fetch(updated.channelId);
      const message = await channel.messages.fetch(updated.messageId);

      await message.edit({
        content: `✏️ **Edited Report** — Updated details applied.`,
        files: [cardPath]
      });

      await db.updateReport(reportId, { imagePath: cardPath });

      return interaction.reply({
        content:
          "✨ Update complete!\n" +
          `• Pokémon: **${updated.pokemonName}**\n` +
          `• Route: **${updated.location}**`,
        ephemeral: true
      });
    } catch (err) {
      console.error("❌ Failed to update edited report card:", err);
      return interaction.reply({
        content: "❌ Failed to update card message — contact admin.",
        ephemeral: true
      });
    }
  }
};

// interactions/modals/reportEditModal.cjs
// Applies edits: re-renders card + updates DB + updates Discord message

const db = require("../../database.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");

module.exports = {
  ids: ["reportedit_"],

  async execute(client, interaction) {
    const id = interaction.customId.replace("reportedit_", "");

    const newPokemon = interaction.fields.getTextInputValue("pokemon") || "";
    const newRoute = interaction.fields.getTextInputValue("route") || "";

    // Must edit at least one field
    if (!newPokemon && !newRoute) {
      return interaction.reply({
        content: "❌ You must change **Pokémon**, **Route**, or both.",
        flags: 64
      });
    }

    // Load report
    const r = await db.getReport(id);
    if (!r) {
      return interaction.reply({ content: "❌ Report not found.", flags: 64 });
    }

    // Reporter permission
    if (r.reporter_id !== interaction.user.id) {
      return interaction.reply({
        content: "⛔ Only the original reporter can edit this.",
        flags: 64
      });
    }

    // Apply edits
    const pokemonName = newPokemon || r.pokemon_name;
    const location = newRoute || r.location;

    // Recompute rarity from new Pokémon
    const rarityKey = getRarity(pokemonName);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // Re-render card
    const cardPath = await createReportCard({
      trainerName: r.reporter_name,
      trainerRank: r.trainer_rank || "Trainer",
      pokemonName,
      rarityKey,
      rarityLabel,
      points: r.points,
      location,
      statusText: "Active"
    });

    // Edit Discord message
    try {
      const channel = await client.channels.fetch(r.channel_id);
      const msg = await channel.messages.fetch(r.message_id);

      await msg.edit({
        content: `✏️ **Edited Report**`,
        files: [cardPath],
        components: msg.components // keep buttons
      });
    } catch (err) {
      console.error("❌ Message edit error:", err);
    }

    // Update DB
    await db.updateReport(id, {
      pokemon_name: pokemonName,
      rarity_key: rarityKey,
      rarity_label: rarityLabel,
      location,
      image_path: cardPath
    });

    return interaction.reply({
      content: "✔ **Report updated successfully.**",
      flags: 64
    });
  }
};

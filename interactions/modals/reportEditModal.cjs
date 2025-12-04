// interactions/modals/reportEditModal.cjs

const fs = require("fs");
const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel, rarityGroups } = require("../../utils/rarity.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const { availableLocations } = require("../../utils/locations.cjs");

// Build canonical lists for validation (same source as autocomplete)
const ALL_POKEMON = Object.values(rarityGroups).flat();

// Helper: case-insensitive match → canonical name or null
function findCanonicalPokemon(input) {
  if (!input) return null;
  const lower = input.trim().toLowerCase();
  return (
    ALL_POKEMON.find(p => p.toLowerCase() === lower) ||
    null
  );
}

function findCanonicalLocation(input) {
  if (!input) return null;
  const lower = input.trim().toLowerCase();
  return (
    availableLocations.find(l => l.toLowerCase() === lower) ||
    null
  );
}

module.exports = {
  // Modal handler prefix used by modalHandler.cjs
  idPrefix: "reporteditmodal_",

  /**
   * @param {Client} client
   * @param {ModalSubmitInteraction} interaction
   * @param {string} reportId  (extracted by your modal handler from customId)
   */
  async execute(client, interaction, reportId) {
    // Always fetch normalised report object
    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.reply({
        content: "❌ This report no longer exists.",
        ephemeral: true
      });
    }

    // Only original reporter can edit here – staff override is handled on the button itself
    if (interaction.user.id !== report.reporterId) {
      return interaction.reply({
        content: "⛔ Only the original reporter can edit this report.",
        ephemeral: true
      });
    }

    // Raw modal values
    const rawPokemon = interaction.fields.getTextInputValue("pokemon")?.trim();
    const rawRoute = interaction.fields.getTextInputValue("route")?.trim();

    if (!rawPokemon && !rawRoute) {
      return interaction.reply({
        content: "⚠ Please change at least one field.",
        ephemeral: true
      });
    }

    // ─────────────────────────────────────────────
    // VALIDATION (against autocomplete lists)
    // ─────────────────────────────────────────────
    let newPokemonName = null;
    let newLocation = null;

    if (rawPokemon) {
      const canonical = findCanonicalPokemon(rawPokemon);
      if (!canonical) {
        return interaction.reply({
          content:
            "❌ That Pokémon name isn't recognised.\n" +
            "Please type it **exactly** as shown in the autocomplete list used for `/report`.",
          ephemeral: true
        });
      }
      newPokemonName = canonical;
    }

    if (rawRoute) {
      const canonical = findCanonicalLocation(rawRoute);
      if (!canonical) {
        return interaction.reply({
          content:
            "❌ That route/location isn't recognised.\n" +
            "Please type it **exactly** as shown in the autocomplete list used for `/report`.",
          ephemeral: true
        });
      }
      newLocation = canonical;
    }

    // If both canonical values match the existing data, don't do a no-op edit
    const pokemonSame =
      !newPokemonName || newPokemonName === report.pokemonName;
    const routeSame =
      !newLocation || newLocation === report.location;

    if (pokemonSame && routeSame) {
      return interaction.reply({
        content: "⚠ Nothing changed — Pokémon and route are the same as before.",
        ephemeral: true
      });
    }

    // ─────────────────────────────────────────────
    // BUILD PATCH (NO EXTRA POINTS OR RANK CHANGES)
    // ─────────────────────────────────────────────
    const patch = {};

    if (newPokemonName) {
      const rarityKey = getRarity(newPokemonName);
      patch.pokemonName = newPokemonName;
      patch.rarityKey = rarityKey;
      patch.rarityLabel = getRarityDisplayLabel(rarityKey);
      // ✨ IMPORTANT:
      //  - Do NOT change points
      //  - Do NOT change trainerRank
      //    (no bonus points for editing a report)
    }

    if (newLocation) {
      patch.location = newLocation;
    }

    // Update DB row – using camelCase keys so normalizeReportObject picks them up correctly
    const updated = await db.updateReport(reportId, patch);

    // ─────────────────────────────────────────────
    // RE-RENDER CARD WITH UPDATED DATA
    // ─────────────────────────────────────────────
    const statusText = updated.status === "expired" ? "Expired" : "Active";

    const newCardPath = await createReportCard({
      trainerName: updated.reporterName,
      trainerRank: updated.trainerRank,
      pokemonName: updated.pokemonName,
      rarityKey: updated.rarityKey,
      rarityLabel: updated.rarityLabel,
      points: updated.points,
      location: updated.location,
      statusText
    });

    // Clean up old image file (Discord keeps CDN copy already sent, so it's safe)
    if (report.imagePath && fs.existsSync(report.imagePath)) {
      try {
        fs.unlinkSync(report.imagePath);
      } catch (err) {
        console.warn("⚠ Failed to delete old report card image:", err);
      }
    }

    // Store new image path in DB (again using camelCase key)
    await db.updateReport(reportId, { imagePath: newCardPath });

    // ─────────────────────────────────────────────
    // EDIT THE EXISTING DISCORD MESSAGE
    //   - Card only (no content text)
    //   - Keep existing buttons (Edit/Delete)
    // ─────────────────────────────────────────────
    try {
      const channel = await client.channels.fetch(updated.channelId);
      const msg = await channel.messages.fetch(updated.messageId);

      await msg.edit({
        content: "",
        files: [newCardPath],
        components: msg.components // keep the action row with buttons
      });
    } catch (err) {
      console.error("❌ Failed to update report message:", err);
    }

    // Final reply to the user (ephemeral)
    return interaction.reply({
      content: "✏ Your report has been updated and the card has been re-rendered.",
      ephemeral: true
    });
  }
};

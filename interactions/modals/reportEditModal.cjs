// interactions/modals/reportEditModal.cjs

const fs = require("fs");

const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { availableLocations } = require("../../utils/locations.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const {
  getChannelForRarity
} = require("../../utils/reportChannelRouter.cjs");

// Staff roles (same pattern as other staff checks)
const STAFF_ROLES = (process.env.STAFF_ROLES || "")
  .split(",")
  .map(r => r.trim())
  .filter(Boolean);

module.exports = {
  // 🔥 Correct identifier for modal handling
  ids: ["reporteditmodal_"],

  /**
   * @param {Client} client
   * @param {ModalSubmitInteraction} interaction
   * @param {string} reportId
   */
  async execute(client, interaction, reportId) {
    // Load the latest report from DB
    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.reply({
        content: "❌ This report no longer exists.",
        ephemeral: true
      });
    }

    // Permissions check — original reporter OR staff
    const member = interaction.member;
    const isReporter = interaction.user.id === report.reporterId;
    const isStaff =
      !!member &&
      !!member.roles &&
      member.roles.cache.some(r => STAFF_ROLES.includes(r.id));
    if (!isReporter && !isStaff) {
      return interaction.reply({
        content: "⛔ Only the original reporter or staff can edit this report.",
        ephemeral: true
      });
    }

    // Input fields
    const newPokemonRaw = interaction.fields.getTextInputValue("pokemon") || "";
    const newRouteRaw = interaction.fields.getTextInputValue("route") || "";

    const newPokemon = newPokemonRaw.trim();
    const newRoute = newRouteRaw.trim();

    if (!newPokemon && !newRoute) {
      return interaction.reply({
        content: "⚠ Please change at least one field.",
        ephemeral: true
      });
    }

    // Route validation
    if (
      newRoute &&
      !availableLocations.some(
        l => l.toLowerCase() === newRoute.toLowerCase()
      )
    ) {
      return interaction.reply({
        content: `❌ Invalid location: **${newRoute}**\n(Please use autocomplete suggestions)`,
        ephemeral: true
      });
    }

    // Build DB patch — detect rarity change
    const patch = {};
    let rarityChanged = false;

    if (newPokemon) {
      const rarityKey = getRarity(newPokemon);
      const rarityLabel = getRarityDisplayLabel(rarityKey);

      patch.pokemonName = newPokemon;
      patch.rarityKey = rarityKey;
      patch.rarityLabel = rarityLabel;

      if (rarityKey !== report.rarityKey) rarityChanged = true;
    }

    if (newRoute) patch.location = newRoute;

    // Save patch to DB
    const updated = await db.updateReport(reportId, patch);
    if (!updated) {
      return interaction.reply({
        content: "❌ Failed to update the report in DB.",
        ephemeral: true
      });
    }

    // Re-render card
    const statusText = updated.status === "expired" ? "Expired" : "Active";
    const newCardPath = await createReportCard({
      trainerName: updated.reporterName,
      trainerRank: updated.trainerRank || "Trainer",
      pokemonName: updated.pokemonName,
      rarityKey: updated.rarityKey,
      rarityLabel: updated.rarityLabel,
      points: updated.points,
      location: updated.location,
      statusText
    });

    // Clean old image
    if (report.imagePath && fs.existsSync(report.imagePath)) {
      try {
        fs.unlinkSync(report.imagePath);
      } catch (err) {
        console.warn("⚠ Failed to delete old report image:", err);
      }
    }

    // Routing logic
    const oldChannelId = report.channelId;
    const oldMessageId = report.messageId;
    let newChannelId = oldChannelId;
    let newMessageId = oldMessageId;

    try {
      if (rarityChanged) {
        const routedChannelId = getChannelForRarity(updated.rarityKey);

        if (routedChannelId && routedChannelId !== oldChannelId) {
          // New channel
          const newChannel = await client.channels.fetch(routedChannelId).catch(() => null);
          if (newChannel) {
            const newMsg = await newChannel.send({ files: [newCardPath] });
            newChannelId = newChannel.id;
            newMessageId = newMsg.id;

            // Remove old message
            const oldChannel = await client.channels.fetch(oldChannelId).catch(() => null);
            if (oldChannel) {
              const oldMsg = await oldChannel.messages.fetch(oldMessageId).catch(() => null);
              if (oldMsg) await oldMsg.delete().catch(() => {});
            }
          }
        } else {
          // Fallback edit in same channel
          const ch = await client.channels.fetch(oldChannelId).catch(() => null);
          if (ch) {
            const msg = await ch.messages.fetch(oldMessageId).catch(() => null);
            if (msg) await msg.edit({ files: [newCardPath] });
          }
        }
      } else {
        // In-place edit
        const ch = await client.channels.fetch(oldChannelId).catch(() => null);
        if (ch) {
          const msg = await ch.messages.fetch(oldMessageId).catch(() => null);
          if (msg) await msg.edit({ files: [newCardPath] });
        }
      }
    } catch (err) {
      console.error("❌ Failed to move/edit card:", err);
    }

    // Save final metadata
    await db.updateReport(reportId, {
      imagePath: newCardPath,
      channelId: newChannelId,
      messageId: newMessageId
    });

    // Response
    return interaction.reply({
      content:
        "✏ Report updated!" +
        (rarityChanged
          ? "\n\n📊 Rarity changed — card moved to correct channel."
          : ""),
      ephemeral: true
    });
  }
};
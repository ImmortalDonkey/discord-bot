// interactions/modals/reportEditModal.cjs
// FULL CORRECT + PATCHED CODE — 100% READY TO PASTE

const fs = require("fs");

const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { availableLocations } = require("../../utils/locations.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const { getChannelForRarity } = require("../../utils/reportChannelRouter.cjs");

// Staff roles
const STAFF_ROLES = (process.env.STAFF_ROLES || "")
  .split(",")
  .map(r => r.trim())
  .filter(Boolean);

module.exports = {
  idPrefix: "reporteditmodal_", // REQUIRED for modal loader

  /**
   * @param {Client} client
   * @param {ModalSubmitInteraction} interaction
   */
  async execute(client, interaction) {
    // Prevent "Unknown interaction"
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: 64 }).catch(() => {});
      }
    } catch {}

    // Extract the report ID
    const fullId = interaction.customId || "";
    const reportId = fullId.replace("reporteditmodal_", "");

    // Load latest DB state
    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.followUp("❌ This report no longer exists.");
    }

    // Permission check — reporter or staff
    const member = interaction.member;
    const isReporter = interaction.user.id === report.reporterId;
    const isStaff =
      member &&
      member.roles &&
      member.roles.cache.some(r => STAFF_ROLES.includes(r.id));

    if (!isReporter && !isStaff) {
      return interaction.followUp("⛔ You are not allowed to edit this report.");
    }

    // Read form inputs
    const newPokemon = (interaction.fields.getTextInputValue("pokemon") || "").trim();
    const newRoute = (interaction.fields.getTextInputValue("route") || "").trim();

    if (!newPokemon && !newRoute) {
      return interaction.followUp("⚠ You must change something.");
    }

    // Route validation
    if (
      newRoute &&
      !availableLocations.some(
        l => l.toLowerCase() === newRoute.toLowerCase()
      )
    ) {
      return interaction.followUp(`❌ Invalid location: **${newRoute}**`);
    }

    // Patch DB row
    const patch = {};
    let rarityChanged = false;

    if (newPokemon) {
      const rarityKey = getRarity(newPokemon);
      patch.pokemonName = newPokemon;
      patch.rarityKey = rarityKey;
      patch.rarityLabel = getRarityDisplayLabel(rarityKey);

      if (rarityKey !== report.rarityKey) {
        rarityChanged = true;
      }
    }

    if (newRoute) {
      patch.location = newRoute;
    }

    const updated = await db.updateReport(reportId, patch);

    // Re-render card image
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

    // Delete old image from disk if exists
    if (report.imagePath && fs.existsSync(report.imagePath)) {
      try {
        fs.unlinkSync(report.imagePath);
      } catch {}
    }

    // Existing placement
    const oldChannelId = report.channelId;
    const oldMessageId = report.messageId;

    let newChannelId = oldChannelId;
    let newMessageId = oldMessageId;

    // Fetch correct rarity channel (if changed)
    const newCorrectChannel = getChannelForRarity(updated.rarityKey);

    try {
      if (rarityChanged && newCorrectChannel && newCorrectChannel !== oldChannelId) {
        // Move message to the new correct channel
        const routedChannel = await client.channels.fetch(newCorrectChannel).catch(() => null);
        if (routedChannel) {
          const newMsg = await routedChannel.send({ files: [newCardPath] });
          newChannelId = newMsg.channelId;
          newMessageId = newMsg.id;

          const oldChannel = await client.channels.fetch(oldChannelId).catch(() => null);
          if (oldChannel) {
            const oldMsg = await oldChannel.messages.fetch(oldMessageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
          }
        }
      } else {
        // Edit existing message in place
        const channel = await client.channels.fetch(oldChannelId).catch(() => null);
        if (channel) {
          const msg = await channel.messages.fetch(oldMessageId).catch(() => null);
          if (msg) await msg.edit({ files: [newCardPath] });
        }
      }
    } catch (err) {
      console.error("Edit placement error:", err);
    }

    // Update DB with new image/channel/message
    await db.updateReport(reportId, {
      imagePath: newCardPath,
      channelId: newChannelId,
      messageId: newMessageId
    });

    return interaction.followUp(
      rarityChanged
        ? "✏ Report updated — moved to correct channel for new rarity!"
        : "✏ Report updated successfully!"
    );
  }
};
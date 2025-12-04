// interactions/modals/reportEditModal.cjs
// Comprehensive patched version:
//  - Immediate deferReply() to prevent "Unknown interaction"
//  - Rarity-change routing fully enabled
//  - All previous logic preserved

const fs = require("fs");

const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { availableLocations } = require("../../utils/locations.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const {
  getChannelForRarity
} = require("../../utils/reportChannelRouter.cjs");

const STAFF_ROLES = (process.env.STAFF_ROLES || "")
  .split(",")
  .map(r => r.trim())
  .filter(Boolean);

module.exports = {
  // Modal ID prefix must match editReport.cjs button ID
  ids: ["reporteditmodal_"],

  /**
   * @param {Client} client
   * @param {ModalSubmitInteraction} interaction
   */
  async execute(client, interaction) {
    // 🟢 Ensure Discord doesn’t expire our modal response
    await interaction.deferReply({ flags: 64 }).catch(() => {});

    const customId = interaction.customId || "";
    const reportId = customId.replace("reporteditmodal_", "");
    if (!reportId) {
      return interaction.followUp({ content: "❌ Invalid report ID." });
    }

    // Fetch latest DB state
    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.followUp({
        content: "❌ This report no longer exists."
      });
    }

    // Permissions
    const member = interaction.member;
    const isReporter = interaction.user.id === report.reporterId;
    const isStaff =
      !!member &&
      !!member.roles &&
      member.roles.cache.some(r => STAFF_ROLES.includes(r.id));

    if (!isReporter && !isStaff) {
      return interaction.followUp({
        content: "⛔ Only the original reporter or staff can edit this report."
      });
    }

    // Input fields
    const newPokemon = (interaction.fields.getTextInputValue("pokemon") || "").trim();
    const newRoute = (interaction.fields.getTextInputValue("route") || "").trim();

    if (!newPokemon && !newRoute) {
      return interaction.followUp({
        content: "⚠ You must change at least one field."
      });
    }

    // Validate location
    if (
      newRoute &&
      !availableLocations.some(l => l.toLowerCase() === newRoute.toLowerCase())
    ) {
      return interaction.followUp({
        content: `❌ Invalid location: **${newRoute}**\n(Use an autocomplete option)`
      });
    }

    // Apply updates
    const patch = {};
    let rarityChanged = false;

    if (newPokemon) {
      const rarityKey = getRarity(newPokemon);
      const rarityLabel = getRarityDisplayLabel(rarityKey);

      patch.pokemonName = newPokemon;
      patch.rarityKey = rarityKey;
      patch.rarityLabel = rarityLabel;

      rarityChanged = rarityKey !== report.rarityKey;
    }

    if (newRoute) patch.location = newRoute;

    const updated = await db.updateReport(reportId, patch);
    if (!updated) {
      return interaction.followUp({
        content: "❌ Database update failed."
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

    // Remove old card PNG
    if (report.imagePath && fs.existsSync(report.imagePath)) {
      fs.unlinkSync(report.imagePath);
    }

    // Channel + message update
    const oldChannelId = report.channelId;
    const oldMessageId = report.messageId;

    let newChannelId = oldChannelId;
    let newMessageId = oldMessageId;

    try {
      if (rarityChanged) {
        const newChannelTarget = getChannelForRarity(updated.rarityKey);
        if (newChannelTarget && newChannelTarget !== oldChannelId) {
          const newChannel = await client.channels
            .fetch(newChannelTarget)
            .catch(() => null);

          if (newChannel) {
            const newMsg = await newChannel.send({ files: [newCardPath] });

            newChannelId = newMsg.channelId;
            newMessageId = newMsg.id;

            const oldChannel = await client.channels.fetch(oldChannelId).catch(() => null);
            if (oldChannel) {
              const oldMsg = await oldChannel.messages.fetch(oldMessageId).catch(() => null);
              if (oldMsg) await oldMsg.delete().catch(() => {});
            }
          }
        } else {
          const ch = await client.channels.fetch(oldChannelId).catch(() => null);
          if (ch) {
            const msg = await ch.messages.fetch(oldMessageId).catch(() => null);
            if (msg) await msg.edit({ files: [newCardPath] });
          }
        }
      } else {
        const ch = await client.channels.fetch(oldChannelId).catch(() => null);
        if (ch) {
          const msg = await ch.messages.fetch(oldMessageId).catch(() => null);
          if (msg) await msg.edit({ files: [newCardPath] });
        }
      }
    } catch (err) {
      console.error("❌ Failed to update card:", err);
    }

    // Store new file + channel/message
    await db.updateReport(reportId, {
      imagePath: newCardPath,
      channelId: newChannelId,
      messageId: newMessageId
    });

    // Final user confirmation
    return interaction.followUp({
      content: rarityChanged
        ? "✏ Report updated! 📊 Rarity changed — card moved to correct channel."
        : "✏ Report updated!"
    });
  }
};
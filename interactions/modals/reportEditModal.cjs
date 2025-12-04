// interactions/modals/reportEditModal.cjs
// Fully patched version with correct idPrefix support
// + safe deferReply to prevent Unknown Interaction errors

const fs = require("fs");

const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { availableLocations } = require("../../utils/locations.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const { getChannelForRarity } = require("../../utils/reportChannelRouter.cjs");

const STAFF_ROLES = (process.env.STAFF_ROLES || "")
  .split(",")
  .map(r => r.trim())
  .filter(Boolean);

module.exports = {
  idPrefix: "reporteditmodal_", // 👈 required by your modal loader

  /**
   * @param {Client} client
   * @param {ModalSubmitInteraction} interaction
   */
  async execute(client, interaction) {
    try {
      await interaction.deferReply({ flags: 64 }).catch(() => {});
    } catch {}

    const fullId = interaction.customId || "";
    const reportId = fullId.replace("reporteditmodal_", "");

    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.followUp("❌ Report no longer exists.");
    }

    const member = interaction.member;
    const isReporter = interaction.user.id === report.reporterId;
    const isStaff =
      member &&
      member.roles.cache.some(r => STAFF_ROLES.includes(r.id));

    if (!isReporter && !isStaff) {
      return interaction.followUp("⛔ Not allowed to edit this report.");
    }

    const newPokemon = (interaction.fields.getTextInputValue("pokemon") || "").trim();
    const newRoute = (interaction.fields.getTextInputValue("route") || "").trim();

    if (!newPokemon && !newRoute) {
      return interaction.followUp("⚠ No changes entered.");
    }

    if (
      newRoute &&
      !availableLocations.some(l => l.toLowerCase() === newRoute.toLowerCase())
    ) {
      return interaction.followUp(`❌ Invalid route: **${newRoute}**`);
    }

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

    if (report.imagePath && fs.existsSync(report.imagePath)) {
      fs.unlinkSync(report.imagePath);
    }

    const oldChannelId = report.channelId;
    const oldMessageId = report.messageId;

    let newChannelId = oldChannelId;
    let newMessageId = oldMessageId;

    const correctChannelId = getChannelForRarity(updated.rarityKey);

    try {
      if (rarityChanged && correctChannelId && correctChannelId !== oldChannelId) {
        const newChannel = await client.channels.fetch(correctChannelId).catch(() => null);
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
    } catch (err) {
      console.error("Update error:", err);
    }

    await db.updateReport(reportId, {
      imagePath: newCardPath,
      channelId: newChannelId,
      messageId: newMessageId
    });

    return interaction.followUp(rarityChanged
      ? "✏ Updated & moved to correct channel!"
      : "✏ Report updated!");
  }
};
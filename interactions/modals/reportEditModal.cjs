// interactions/modals/reportEditModal.cjs
// Handles in-place + re-routed updates for edited report cards

const fs = require("fs");
const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { availableLocations } = require("../../utils/locations.cjs");
const { createReportCard } = require("../../renderers/reportCard.cjs");
const {
  getChannelForRarity
} = require("../../utils/reportChannelRouter.cjs");

// Staff-allowed editing
const STAFF_ROLES = (process.env.STAFF_ROLES || "")
  .split(",")
  .map(r => r.trim())
  .filter(Boolean);

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

    // Get modal inputs
    const newPokemon = interaction.fields.getTextInputValue("pokemon")?.trim() || "";
    const newRoute = interaction.fields.getTextInputValue("route")?.trim() || "";

    if (!newPokemon && !newRoute) {
      return interaction.reply({
        content: "⚠ Please change at least one field.",
        ephemeral: true
      });
    }

    // Route validation
    if (
      newRoute &&
      !availableLocations.some(l => l.toLowerCase() === newRoute.toLowerCase())
    ) {
      return interaction.reply({
        content: `❌ Invalid location: **${newRoute}**\n(Please use autocomplete)`,
        ephemeral: true
      });
    }

    // Build DB patch
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

    const updated = await db.updateReport(reportId, patch);
    if (!updated) {
      return interaction.reply({
        content: "❌ Failed to update report database entry.",
        ephemeral: true
      });
    }

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

    const oldChannelId = report.channelId;
    const oldMessageId = report.messageId;

    let newChannelId = oldChannelId;
    let newMessageId = oldMessageId;

    try {
      if (rarityChanged) {
        const routedId = getChannelForRarity(updated.rarityKey);

        if (routedId && routedId !== oldChannelId) {
          const routedChannel = await client.channels.fetch(routedId).catch(() => null);
          if (routedChannel) {
            const newMsg = await routedChannel.send({
              files: [newCardPath]
            });

            newChannelId = routedChannel.id;
            newMessageId = newMsg.id;

            const oldChannel = await client.channels.fetch(oldChannelId).catch(() => null);
            if (oldChannel) {
              const oldMsg = await oldChannel.messages.fetch(oldMessageId).catch(() => null);
              if (oldMsg) await oldMsg.delete().catch(() => {});
            }
          } else {
            console.warn("⚠ Channel not found, fallback editing in place.");
            const channel = await client.channels.fetch(oldChannelId).catch(() => null);
            if (channel) {
              const msg = await channel.messages.fetch(oldMessageId).catch(() => null);
              if (msg) {
                await msg.edit({ files: [newCardPath] }).catch(console.error);
              }
            }
          }
        } else {
          const channel = await client.channels.fetch(oldChannelId).catch(() => null);
          if (channel) {
            const msg = await channel.messages.fetch(oldMessageId).catch(() => null);
            if (msg) await msg.edit({ files: [newCardPath] });
          }
        }
      } else {
        const channel = await client.channels.fetch(oldChannelId).catch(() => null);
        if (channel) {
          const msg = await channel.messages.fetch(oldMessageId).catch(() => null);
          if (msg) {
            await msg.edit({ files: [newCardPath] })
              .then(() => {
                if (report.imagePath && fs.existsSync(report.imagePath)) {
                  fs.unlinkSync(report.imagePath);
                }
              })
              .catch(async err => {
                console.error("❌ Edit failed, fallback sending new:", err);
                const newMsg = await channel.send({ files: [newCardPath] });
                newChannelId = channel.id;
                newMessageId = newMsg.id;
              });
          } else {
            const newMsg = await channel.send({ files: [newCardPath] });
            newChannelId = channel.id;
            newMessageId = newMsg.id;
          }
        }
      }
    } catch (err) {
      console.error("❌ Message update error:", err);
    }

    await db.updateReport(reportId, {
      imagePath: newCardPath,
      channelId: newChannelId,
      messageId: newMessageId
    });

    let extra = "";
    if (rarityChanged) {
      extra = "\n\n📊 Rarity changed — card re-routed.";
    }

    return interaction.reply({
      content: "✏ Report updated!" + extra,
      ephemeral: true
    });
  }
};
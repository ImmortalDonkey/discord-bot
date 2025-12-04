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
  // 🔁 used by modalHandler to route this modal
  ids: ["reporteditmodal_"], // must match button customId prefix

  /**
   * @param {Client} client
   * @param {ModalSubmitInteraction} interaction
   */
  async execute(client, interaction) {
    // Derive reportId from customId, e.g. "reporteditmodal_report_123" → "report_123"
    const customId = interaction.customId || "";
    const reportId = customId.replace("reporteditmodal_", "");
    if (!reportId) {
      return interaction.reply({
        content: "❌ Invalid report identifier.",
        ephemeral: true
      });
    }

    // Load the latest report state from DB
    const report = await db.getReport(reportId);
    if (!report) {
      return interaction.reply({
        content: "❌ This report no longer exists.",
        ephemeral: true
      });
    }

    // ─────────────────────────────────────────────
    // PERMISSION: reporter OR staff (option C)
    // ─────────────────────────────────────────────
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

    // ─────────────────────────────────────────────
    // READ INPUTS
    // ─────────────────────────────────────────────
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

    // Validate Route against availableLocations
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

    // ─────────────────────────────────────────────
    // BUILD PATCH (no points recalculation)
    // ─────────────────────────────────────────────
    const patch = {};
    let rarityChanged = false;

    if (newPokemon) {
      const rarityKey = getRarity(newPokemon);
      const rarityLabel = getRarityDisplayLabel(rarityKey);

      patch.pokemonName = newPokemon;
      patch.rarityKey = rarityKey;
      patch.rarityLabel = rarityLabel;

      if (rarityKey !== report.rarityKey) {
        rarityChanged = true;
      }
    }

    if (newRoute) {
      patch.location = newRoute;
    }

    // Apply DB update (without touching channel/message/image yet)
    const updated = await db.updateReport(reportId, patch);
    if (!updated) {
      return interaction.reply({
        content: "❌ Failed to update the report in the database.",
        ephemeral: true
      });
    }

    // ─────────────────────────────────────────────
    // RE-RENDER CARD
    // ─────────────────────────────────────────────
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

    // Delete OLD image on disk (if any)
    if (report.imagePath && fs.existsSync(report.imagePath)) {
      try {
        fs.unlinkSync(report.imagePath);
      } catch (err) {
        console.warn("⚠ Failed to delete old report image:", err);
      }
    }

    // ─────────────────────────────────────────────
    // ROUTING: did rarity change → move to correct channel?
    // ─────────────────────────────────────────────
    const oldChannelId = report.channelId;
    const oldMessageId = report.messageId;

    let newChannelId = oldChannelId;
    let newMessageId = oldMessageId;

    try {
      if (rarityChanged) {
        // Find the configured channel for the *new* rarity
        const routedChannelId = getChannelForRarity(updated.rarityKey);
        if (routedChannelId && routedChannelId !== oldChannelId) {
          // Attempt to send NEW message in proper channel
          const newChannel = await client.channels
            .fetch(routedChannelId)
            .catch(() => null);

          if (newChannel) {
            const newMsg = await newChannel.send({
              files: [newCardPath]
            });

            newChannelId = newChannel.id;
            newMessageId = newMsg.id;

            // Try to delete old message
            const oldChannel = await client.channels
              .fetch(oldChannelId)
              .catch(() => null);
            if (oldChannel) {
              const oldMsg = await oldChannel.messages
                .fetch(oldMessageId)
                .catch(() => null);
              if (oldMsg) {
                await oldMsg.delete().catch(() => {});
              }
            }
          } else {
            // Fallback: channel configured but not found → just edit in place
            const fallbackChannel = await client.channels
              .fetch(oldChannelId)
              .catch(() => null);
            if (fallbackChannel) {
              const msg = await fallbackChannel.messages
                .fetch(oldMessageId)
                .catch(() => null);
              if (msg) {
                await msg.edit({
                  files: [newCardPath]
                });
              }
            }
          }
        } else {
          // Rarity changed but mapping is same / missing → simple in-place edit
          const channel = await client.channels
            .fetch(oldChannelId)
            .catch(() => null);
          if (channel) {
            const msg = await channel.messages
              .fetch(oldMessageId)
              .catch(() => null);
            if (msg) {
              await msg.edit({
                files: [newCardPath]
              });
            }
          }
        }
      } else {
        // Rarity unchanged → in-place edit
        const channel = await client.channels
          .fetch(oldChannelId)
          .catch(() => null);
        if (channel) {
          const msg = await channel.messages
            .fetch(oldMessageId)
            .catch(() => null);
          if (msg) {
            await msg.edit({
              files: [newCardPath]
            });
          }
        }
      }
    } catch (err) {
      console.error("❌ Failed to apply channel/message update:", err);
    }

    // ─────────────────────────────────────────────
    // FINAL DB UPDATE: new image + potential channel/message change
    // ─────────────────────────────────────────────
    await db.updateReport(reportId, {
      imagePath: newCardPath,
      channelId: newChannelId,
      messageId: newMessageId
    });

    // ─────────────────────────────────────────────
    // REPLY
    // ─────────────────────────────────────────────
    let extra = "";
    if (rarityChanged) {
      extra = "\n\n📊 Rarity changed — the card has been re-routed to the correct channel (if configured).";
    }

    return interaction.reply({
      content: "✏ Report updated!" + extra,
      ephemeral: true
    });
  }
};
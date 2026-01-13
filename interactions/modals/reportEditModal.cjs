// interactions/modals/reportEditModal.cjs
// Handles the modal submission for editing a report.
// IMPORTANT: This file MUST NOT post/edit/delete Discord messages directly.
// All mutations fan-out via utils/reportDispatcher.cjs

const db = require("../../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { availableLocations } = require("../../utils/locations.cjs");
const { dispatchReportUpdate } = require("../../utils/reportDispatcher.cjs");

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

    if (newPokemon) {
      const rarityKey = getRarity(newPokemon);
      patch.pokemonName = newPokemon;
      patch.rarityKey = rarityKey;
      patch.rarityLabel = getRarityDisplayLabel(rarityKey);
    }

    if (newRoute) {
      patch.location = newRoute;
    }

    await db.updateReport(reportId, patch);

    // Fan-out update across all guilds/messages this report was posted to.
    await dispatchReportUpdate(client, reportId);

    return interaction.followUp("✏ Report updated successfully!");
  }
};
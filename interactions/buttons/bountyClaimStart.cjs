// interactions/buttons/bountyClaimStart.cjs
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");

const db = require("../../database.cjs");

module.exports = {
  ids: ["claimbounty_"],

  async execute(client, interaction) {
    try {
      const customId = interaction.customId;          // e.g. "claimbounty_<bountyId>"
      const bountyId = customId.replace("claimbounty_", "");
      const userId = interaction.user.id;

      // ----------------------------------------------------------
      // 1️⃣ Load bounty from DB (via our API)
      // ----------------------------------------------------------
      const bounty = await db.getBountyById(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty no longer exists.",
          ephemeral: true
        });
      }

      if (bounty.status !== "open") {
        return interaction.reply({
          content: "❌ This bounty is not accepting claims.",
          ephemeral: true
        });
      }

      // ----------------------------------------------------------
      // 2️⃣ Prevent multiple active claims by same user
      // ----------------------------------------------------------
      const existingClaim = await db.getPendingClaimForBountyAndHunter(
        bountyId,
        userId
      );

      if (existingClaim) {
        return interaction.reply({
          content: "⚠ You already have a **pending claim** for this bounty.",
          ephemeral: true
        });
      }

      // ----------------------------------------------------------
      // 3️⃣ Build the modal (safe customId format)
      // ----------------------------------------------------------
      const modalCustomId = `bountyclaim|${bountyId}|${userId}`;

      const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle("Submit Bounty Claim");

      const pokemonIdInput = new TextInputBuilder()
        .setCustomId("pokemon_id")
        .setLabel("Pokémon ID")
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      const proofInput = new TextInputBuilder()
        .setCustomId("proof_optional")
        .setLabel("Proof / Notes (optional)")
        .setRequired(false)
        .setStyle(TextInputStyle.Paragraph);

      modal.addComponents(
        new ActionRowBuilder().addComponents(pokemonIdInput),
        new ActionRowBuilder().addComponents(proofInput)
      );

      await interaction.showModal(modal);
    } catch (err) {
      console.error(
        `❌  Button handler error (claimbounty_${interaction.customId}):`,
        err
      );
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: "❌ An error occurred while opening the claim modal.",
          ephemeral: true
        });
      }
    }
  }
};
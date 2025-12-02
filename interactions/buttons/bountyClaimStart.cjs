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
    const bountyId = interaction.customId.replace("claimbounty_", "");
    const userId = interaction.user.id;

    // ----------------------------------------------------------
    // 1️⃣ Validate bounty exists + is open
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
    // 3️⃣ Build the modal (safe ID format)
    // ----------------------------------------------------------
    const modalCustomId = `bountyclaim|${bountyId}|${userId}`;

    const modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle("Submit Bounty Claim");

    const pokemonId = new TextInputBuilder()
      .setCustomId("pokemon_id")
      .setLabel("Pokémon ID")
      .setRequired(true)
      .setStyle(TextInputStyle.Short);

    const proof = new TextInputBuilder()
      .setCustomId("proof_optional")
      .setLabel("Proof / Notes (optional)")
      .setRequired(false)
      .setStyle(TextInputStyle.Paragraph);

    modal.addComponents(
      new ActionRowBuilder().addComponents(pokemonId),
      new ActionRowBuilder().addComponents(proof)
    );

    await interaction.showModal(modal);
  }
};
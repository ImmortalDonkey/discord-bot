// interactions/buttons/bountyClaimStart.cjs
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");

module.exports = {
  ids: ["claimbounty_"],

  async execute(client, interaction) {
    const bountyId = interaction.customId.replace("claimbounty_", "");
    const userId = interaction.user.id;

    // ✔ NEW SAFE ID FORMAT
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

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

    // IMPORTANT: NEW SAFE ID FORMAT (pipes, not underscores)
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

    const row1 = new ActionRowBuilder().addComponents(pokemonId);
    const row2 = new ActionRowBuilder().addComponents(proof);

    modal.addComponents(row1, row2);

    await interaction.showModal(modal);
  }
};

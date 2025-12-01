// interactions/modals/bountyClaimModal.cjs
const db = require("../../database.cjs");

module.exports = {
  ids: ["bountyclaim|"],   // <-- REQUIRED AND MUST MATCH PREFIX EXACTLY

  async execute(client, interaction) {
    const [prefix, bountyId, hunterId] = interaction.customId.split("|");

    if (!bountyId || !hunterId) {
      return interaction.reply({
        content: "❌ Invalid claim format.",
        flags: 64
      });
    }

    const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
    const proof = interaction.fields.getTextInputValue("proof_optional") || "";

    const bounty = await db.getBountyById(bountyId);
    if (!bounty) {
      return interaction.reply({
        content: "❌ Bounty not found.",
        flags: 64
      });
    }

    // Create claim
    const claimId = `${Date.now()}_${hunterId}`;
    await db.createBountyClaim({
      id: claimId,
      bountyId,
      hunterId,
      pokemonId,
      proof,
      status: "pending",
      createdAt: Date.now(),
      claimThreadId: null
    });

    // Thread
    const forum = interaction.guild.channels.cache.get(process.env.CLAIMS_FORUM_CHANNEL);
    if (!forum) {
      return interaction.reply({
        content: "❌ Claim forum channel missing.",
        flags: 64
      });
    }

    const thread = await forum.threads.create({
      name: `claim-${interaction.user.username}-${pokemonId}`
    });

    await db.updateBountyClaim(claimId, { claimThreadId: thread.id });

    await thread.send({
      content: `<@&${process.env.STAFF_ROLE}>`,
      embeds: [{
        title: "New Bounty Claim",
        fields: [
          { name: "Bounty ID", value: bountyId },
          { name: "Claimer", value: `<@${hunterId}>` },
          { name: "Pokémon ID", value: pokemonId },
          { name: "Notes", value: proof || "None" }
        ]
      }]
    });

    return interaction.reply({
      content: "✅ Your claim has been submitted!",
      flags: 64
    });
  }
};

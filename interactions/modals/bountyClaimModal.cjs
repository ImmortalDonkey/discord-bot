// interactions/modals/bountyClaimModal.cjs
const db = require("../../database.cjs");

module.exports = {
  ids: ["bountyclaim|"],

  async execute(client, interaction) {
    const id = interaction.customId;
    const parts = id.split("|");

    const bountyId = parts[1];
    const hunterId = parts[2];

    if (!bountyId || !hunterId) {
      return interaction.reply({
        content: "❌ Invalid claim data.",
        flags: 64
      });
    }

    const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
    const proof = interaction.fields.getTextInputValue("proof_optional") || "";

    const bounty = await db.getBountyById(bountyId);
    if (!bounty) {
      return interaction.reply({
        content: "❌ Could not find this bounty.",
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

    // FIXED HERE — correct .env variable
    const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
    const forum = interaction.guild.channels.cache.get(forumId);

    if (!forum) {
      return interaction.reply({
        content: "❌ Claim forum channel not found.",
        flags: 64
      });
    }

    // Create claim thread
    const thread = await forum.threads.create({
      name: `claim-${interaction.user.username}-${pokemonId}`
    });

    await db.updateBountyClaim(claimId, {
      claimThreadId: thread.id
    });

    await thread.send({
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

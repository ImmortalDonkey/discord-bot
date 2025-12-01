// interactions/modals/bountyClaimModal.cjs

module.exports = {
  ids: ["bountyclaim|"], // REQUIRED by your loader

  async execute(client, interaction) {
    // ID format: bountyclaim|<bountyId>|<claimerId>
    const parts = interaction.customId.split("|");

    const bountyId = parts[1];
    const claimerId = parts[2];

    if (!bountyId || !claimerId) {
      return interaction.reply({
        content: "❌ Invalid claim modal data.",
        flags: 64
      });
    }

    const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
    const proof = interaction.fields.getTextInputValue("proof_optional") || "";

    const db = require("../../database.cjs");
    const bounty = await db.getBountyById(bountyId);

    if (!bounty) {
      return interaction.reply({
        content: "❌ Could not find this bounty.",
        flags: 64
      });
    }

    // Create claim
    const claimId = `${Date.now()}_${claimerId}`;

    await db.createBountyClaim({
      id: claimId,
      bountyId,
      claimerId,
      pokemonId,
      proof,
      status: "pending",
      createdAt: Date.now(),
      claimThreadId: null
    });

    // Create thread
    const forum = interaction.guild.channels.cache.get(process.env.CLAIMS_FORUM_CHANNEL);

    const thread = await forum.threads.create({
      name: `claim-${interaction.user.username}-${pokemonId}`
    });

    await db.updateBountyClaim(claimId, {
      claimThreadId: thread.id
    });

    await thread.send({
      content: `<@&${process.env.STAFF_ROLE}>`,
      embeds: [{
        title: "New Bounty Claim",
        fields: [
          { name: "Bounty ID", value: bountyId },
          { name: "Claimer", value: `<@${claimerId}>` },
          { name: "Pokémon ID", value: pokemonId },
          { name: "Notes", value: proof || "None" }
        ]
      }]
    });

    return interaction.reply({
      content: "✅ Your claim has been submitted! Staff will review it shortly.",
      flags: 64
    });
  }
};

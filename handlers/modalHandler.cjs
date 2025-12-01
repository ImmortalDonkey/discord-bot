// interactions/modals/bountyClaimModal.cjs

module.exports = {
  // MUST MATCH THE LOADER → array of IDs or prefixes
  ids: ["bountyclaim|"],

  async execute(client, interaction) {
    const id = interaction.customId; 
    // Format: bountyclaim|<bountyId>|<claimerId>
    const parts = id.split("|");
    const bountyId = parts[1];
    const claimerId = parts[2];

    if (!bountyId || !claimerId) {
      return interaction.reply({
        content: "❌ Invalid claim data.",
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

    // Create staff thread
    const guild = interaction.guild;
    const forum = guild.channels.cache.get(process.env.CLAIMS_FORUM_CHANNEL);

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
      content: "✅ Your claim has been submitted!",
      flags: 64
    });
  }
};

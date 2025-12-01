// interactions/modals/bountyClaimModal.cjs

const db = require("../../database.cjs");

module.exports = {
  idStartsWith: "bountyclaim|",

  async execute(client, interaction) {
    const id = interaction.customId;
    // bountyclaim|<bountyId>|<claimerId>
    const parts = id.split("|");
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

    const bounty = await db.getBountyById(bountyId);

    if (!bounty) {
      return interaction.reply({
        content: "❌ Could not find this bounty.",
        flags: 64
      });
    }

    // ⭐ FIX: Create claim WITHOUT providing ID
    const claimId = await db.createBountyClaim({
      bountyId,
      hunterId: claimerId,
      pokemonId,
      proof,
      status: "pending",
      createdAt: Date.now(),
    });

    // Create claim thread
    const guild = interaction.guild;
    const forum = guild.channels.cache.get(process.env.CLAIMS_FORUM_CHANNEL);

    const thread = await forum.threads.create({
      name: `claim-${interaction.user.username}-${pokemonId}`,
    });

    await db.updateBountyClaim(claimId, {
      claim_thread_id: thread.id
    });

    await thread.send({
      content: `<@&${process.env.STAFF_ROLE}>`,
      embeds: [{
        title: "New Bounty Claim",
        fields: [
          { name: "Bounty ID", value: bountyId },
          { name: "Claim ID", value: String(claimId) },
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

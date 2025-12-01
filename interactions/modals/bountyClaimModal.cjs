// interactions/modals/bountyClaimModal.cjs
const db = require("../../database.cjs");

module.exports = {
  // MUST MATCH THE LOADER → array of IDs or prefixes
  ids: ["bountyclaim|"],

  async execute(client, interaction) {
    const id = interaction.customId;
    // Format: bountyclaim|<bountyId>|<hunterId>
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

    // Create claim (in-memory)
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

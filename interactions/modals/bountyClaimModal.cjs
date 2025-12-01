// interactions/modals/bountyClaimModal.cjs

module.exports = {
  // MUST MATCH THE BUTTON CUSTOM ID
  idStartsWith: "bounty_claim_",

  async execute(client, interaction) {
    const id = interaction.customId;  
    // bounty_claim_<bountyId>_<claimerId>

    const parts = id.split("_");
    const bountyId = parts[2];
    const claimerId = parts[3];

    if (!bountyId || !claimerId) {
      return interaction.reply({
        content: "❌ Invalid claim modal data.",
        flags: 64
      });
    }

    const pokemonId =
      interaction.fields.getTextInputValue("pokemon_id")?.trim() || null;
    const notes =
      interaction.fields.getTextInputValue("notes")?.trim() || "";

    if (!pokemonId) {
      return interaction.reply({
        content: "❌ Pokémon ID is required.",
        flags: 64
      });
    }

    const db = require("../../database.cjs");
    const bounty = await db.getBountyById(bountyId);

    if (!bounty) {
      return interaction.reply({
        content: "❌ Could not find this bounty.",
        flags: 64
      });
    }

    // Create claim in DB
    const claimId = `${Date.now()}_${interaction.user.id}`;

    await db.createBountyClaim({
      id: claimId,
      bountyId,
      claimerId,
      pokemonId,
      proof: notes,
      status: "pending",
      createdAt: Date.now(),
      claimThreadId: null
    });

    // Create a staff review thread
    const guild = interaction.guild;
    const claimsForumId = process.env.CLAIMS_FORUM_CHANNEL;
    const forum = guild.channels.cache.get(claimsForumId);

    const thread = await forum.threads.create({
      name: `claim-${interaction.user.username}-${pokemonId}`,
    });

    // Store thread ID
    await db.updateBountyClaim(claimId, {
      claimThreadId: thread.id
    });

    await thread.send({
      content: `<@&${process.env.STAFF_ROLE}>`,
      embeds: [{
        title: "New Bounty Claim",
        description: `A new claim has been submitted.`,
        fields: [
          { name: "Bounty ID", value: bountyId },
          { name: "Claimer", value: `<@${claimerId}>` },
          { name: "Pokémon ID", value: pokemonId },
          { name: "Notes", value: notes || "None" }
        ]
      }]
    });

    return interaction.reply({
      content: "✅ Claim submitted! Staff will review it shortly.",
      flags: 64
    });
  }
};

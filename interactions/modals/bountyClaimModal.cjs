// interactions/modals/bountyClaimModal.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

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

    // Create claim ID
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

    // Create thread
    const forum = interaction.guild.channels.cache.get(process.env.CLAIMS_FORUM_CHANNEL_ID);
    if (!forum) {
      return interaction.reply({
        content: "❌ Claim forum channel not found.",
        flags: 64
      });
    }

    const thread = await forum.threads.create({
      name: `claim-${interaction.user.username}-${pokemonId}`,
      message: {
        content: `📬 New bounty claim submitted by <@${hunterId}>`
      }
    });

    // Save thread ID
    await db.updateBountyClaim(claimId, {
      claimThreadId: thread.id
    });

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle("New Bounty Claim")
      .addFields(
        { name: "Bounty ID", value: bountyId },
        { name: "Claimer", value: `<@${hunterId}>` },
        { name: "Pokémon ID", value: pokemonId },
        { name: "Notes", value: proof || "None" }
      )
      .setColor("Yellow");

    // ADD BUTTONS HERE 👇
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approveclaim_${claimId}`)
        .setLabel("Approve Claim")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`denyclaim_${claimId}`)
        .setLabel("Deny Claim")
        .setStyle(ButtonStyle.Danger)
    );

    await thread.send({
      embeds: [embed],
      components: [row]
    });

    return interaction.reply({
      content: "✅ Your claim has been submitted!",
      flags: 64
    });
  }
};

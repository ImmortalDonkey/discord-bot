// interactions/modals/bountyClaimModal.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require("discord.js");

const db = require("../../database.cjs");
const { getClaimsForumChannel } = require("../../utils/channelResolver.cjs");

module.exports = {
  // NEW: use consistent ID prefix
  ids: ["bountyclaim|"],

  async execute(client, interaction) {
    // Example ID: bountyclaim|<bountyId>|<userId>
    const customId = interaction.customId;
    const parts = customId.split("|");

    const bountyId = parts[1];
    const claimerId = parts[2];

    if (!bountyId || !claimerId) {
      return interaction.reply({
        content: "❌ Invalid claim ID format.",
        flags: 64
      });
    }

    if (interaction.user.id !== claimerId) {
      return interaction.reply({
        content: "❌ You cannot submit a claim for someone else.",
        flags: 64
      });
    }

    const bounty = await db.getBountyById(bountyId);
    if (!bounty) {
      return interaction.reply({
        content: "❌ Could not find this bounty.",
        flags: 64
      });
    }

    if (bounty.status !== "open") {
      return interaction.reply({
        content: "❌ This bounty is no longer open.",
        flags: 64
      });
    }

    const now = Date.now();
    if (now < bounty.start_time || now > bounty.end_time) {
      return interaction.reply({
        content: "❌ This bounty is not currently active.",
        flags: 64
      });
    }

    const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
    const proof = interaction.fields.getTextInputValue("proof_optional") || "";

    // Prevent duplicate pending claims
    const existingClaim = await db.getPendingClaimForBountyAndHunter(
      bountyId,
      claimerId
    );

    if (existingClaim) {
      return interaction.reply({
        content: "❌ You already have a pending claim for this bounty.",
        flags: 64
      });
    }

    const forum = await getClaimsForumChannel(interaction.guild);
    if (!forum) {
      return interaction.reply({
        content: "❌ Claims forum channel is not configured.",
        flags: 64
      });
    }

    const thread = await forum.threads.create({
      name: `Claim-${interaction.user.username}-${Date.now()}`,
      type: ChannelType.PrivateThread,
      invitable: false
    });

    // Insert into DB
    const claimId = await db.createBountyClaim({
      bountyId,
      hunterId: claimerId,
      pokemonId,
      proof,
      status: "pending",
      createdAt: now,
      claimThreadId: thread.id,
      claimMessageId: null
    });

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle("🔎 Bounty Claim Submitted")
      .addFields(
        { name: "Hunter", value: `<@${claimerId}>`, inline: true },
        { name: "Pokémon ID", value: pokemonId, inline: true },
        { name: "Proof", value: proof || "*None provided*" },
        { name: "Claim ID", value: `${claimId}` },
        { name: "Bounty ID", value: bountyId }
      )
      .setColor("Yellow")
      .setTimestamp();

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

    const claimMessage = await thread.send({
      embeds: [embed],
      components: [row]
    });

    await db.updateBountyClaim(claimId, { claim_message_id: claimMessage.id });

    return interaction.reply({
      content: "✅ Your claim has been submitted and is now awaiting staff review.",
      flags: 64
    });
  }
};

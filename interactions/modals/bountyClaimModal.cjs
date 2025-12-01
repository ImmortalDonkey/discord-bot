// interactions/modals/bountyClaimModal.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const db = require("../../database.cjs");
const { getClaimsForumChannel } = require("../../utils/channelResolver.cjs");

module.exports = {
  // modalHandler.cjs expects ids: []
  ids: ["bounty_claim_"],

  /**
   * Handles submissions of the bounty claim modal.
   * Custom ID format: bounty_claim_<bountyId>_<userId>
   */
  async execute(client, interaction) {
    const customId = interaction.customId;
    const parts = customId.split("_");
    const bountyId = parts[2];
    const claimerId = parts[3];

    // Safety: only the original user may submit
    if (interaction.user.id !== claimerId) {
      return interaction.reply({
        content: "❌ You cannot submit a claim for someone else.",
        flags: 64 // ephemeral
      });
    }

    // Load bounty
    const bounty = await db.getBountyById(bountyId);
    if (!bounty || bounty.status !== "open") {
      return interaction.reply({
        content: "❌ This bounty is no longer open.",
        flags: 64
      });
    }

    const now = Date.now();
    if (now < bounty.start_time || now > bounty.end_time) {
      return interaction.reply({
        content: "❌ This bounty is not active right now.",
        flags: 64
      });
    }

    // Modal inputs
    const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
    const proof =
      interaction.fields.getTextInputValue("proof_optional") || "";

    // Check for existing pending claim from this hunter on this bounty
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

    // Resolve the claims forum channel
    const forum = await getClaimsForumChannel(interaction.guild);

    if (!forum || !forum.threads) {
      return interaction.reply({
        content: "❌ Claims forum channel is not configured correctly.",
        flags: 64
      });
    }

    // Create a new thread for this claim
    const thread = await forum.threads.create({
      name: `Claim-${interaction.user.username}-${Date.now()}`,
      // For forum channels, "message" is the starting post
      message: { content: `🧵 **New Bounty Claim Opened** by <@${claimerId}>` }
      // No explicit "type" here; forum threads are created appropriately by Discord
    });

    // Build claim record in the shape expected by createBountyClaim()
    const claimRecord = {
      bountyId,
      hunterId: claimerId,
      pokemonId,
      proof,
      status: "pending",
      createdAt: now,
      resolvedAt: null,
      resolverId: null,
      claimThreadId: thread.id,
      claimMessageId: null
    };

    const claimId = await db.createBountyClaim(claimRecord);

    // Build staff review embed
    const embed = new EmbedBuilder()
      .setTitle("🔎 Bounty Claim Submitted")
      .addFields(
        { name: "Hunter", value: `<@${claimerId}>`, inline: true },
        { name: "Pokémon ID", value: pokemonId, inline: true },
        {
          name: "Proof / Notes",
          value: proof || "*None provided*"
        },
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

    // Save the claim message ID
    await db.updateBountyClaim(claimId, {
      claim_message_id: claimMessage.id
    });

    return interaction.reply({
      content: "✅ Your claim has been submitted for staff review.",
      flags: 64
    });
  }
};

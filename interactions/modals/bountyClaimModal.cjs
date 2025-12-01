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
  // Required by modalHandler.cjs
  ids: ["bounty_claim_"],

  /**
   * Custom ID format:
   *   bounty_claim_<bountyId>_<userId>
   */
  async execute(client, interaction) {
    const customId = interaction.customId;
    const parts = customId.split("_");

    const bountyId = parts[2];
    const claimerId = parts[3];

    // Prevent submitting for someone else
    if (interaction.user.id !== claimerId) {
      return interaction.reply({
        content: "❌ You cannot submit a claim for someone else.",
        flags: 64
      });
    }

    // Load bounty
    const bounty = await db.getBountyById(bountyId);
    if (!bounty) {
      return interaction.reply({
        content: "❌ Could not find this bounty.",
        flags: 64
      });
    }

    const now = Date.now();

    // ✔ Correct: Only enforce time window (start/end)
    if (now < bounty.start_time || now > bounty.end_time) {
      return interaction.reply({
        content: "❌ This bounty is not active right now.",
        flags: 64
      });
    }

    // Get modal inputs
    const pokemonId =
      interaction.fields.getTextInputValue("pokemon_id");
    const proof =
      interaction.fields.getTextInputValue("proof_optional") || "";

    // Check for existing pending claim
    const existingClaim =
      await db.getPendingClaimForBountyAndHunter(bountyId, claimerId);

    if (existingClaim) {
      return interaction.reply({
        content: "❌ You already have a pending claim for this bounty.",
        flags: 64
      });
    }

    // Get forum channel
    const forum = await getClaimsForumChannel(interaction.guild);
    if (!forum) {
      return interaction.reply({
        content: "❌ Claims forum channel is not configured.",
        flags: 64
      });
    }

    // Create a new discussion thread in the forum
    const thread = await forum.threads.create({
      name: `Claim-${interaction.user.username}-${Date.now()}`,
      message: {
        content: `🧵 **New bounty claim submitted by <@${claimerId}>**`
      }
    });

    // Build correct record for DB insert
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

    // Staff review embed
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

    // Buttons for staff review
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

    // Update DB record with message ID
    await db.updateBountyClaim(claimId, {
      claim_message_id: claimMessage.id
    });

    // Notify the claimer
    return interaction.reply({
      content: "✅ Your claim has been submitted for staff review.",
      flags: 64
    });
  }
};

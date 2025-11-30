// interactions/modals/bountyClaimModal.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits
} = require("discord.js");

const db = require("../../database.cjs");
const { getClaimsForumChannel } = require("../../utils/channelResolver.cjs");

module.exports = {
  ids: ["bounty_claim_"],

  async execute(client, interaction) {
    const customId = interaction.customId;

    // Format: bounty_claim_<bountyId>_<userId>
    const parts = customId.split("_");
    // ["bounty", "claim", "<bountyId>", "<userId>"]
    const bountyId = parts[2];
    const claimerId = parts[3];

    // User submitting must match claimerId
    if (interaction.user.id !== claimerId) {
      return interaction.reply({
        content: "❌ You cannot submit a claim for someone else.",
        ephemeral: true
      });
    }

    // ──────────────────────────────────────
    // Load bounty from DB
    // ──────────────────────────────────────
    const bounty = await db.getBountyById(bountyId);

    if (!bounty || bounty.status !== "open") {
      return interaction.reply({
        content: "❌ This bounty is no longer open.",
        ephemeral: true
      });
    }

    const now = Date.now();
    if (now < bounty.start_time || now > bounty.end_time) {
      return interaction.reply({
        content: "❌ This bounty is not active at the moment.",
        ephemeral: true
      });
    }

    // ──────────────────────────────────────
    // Extract modal data
    // ──────────────────────────────────────
    const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
    const proof = interaction.fields.getTextInputValue("proof_optional") || "";

    // ──────────────────────────────────────
    // Check if user already has a claim on this bounty
    // ──────────────────────────────────────
    const existingClaim = await db.get(
      `SELECT * FROM bounty_claims
       WHERE bounty_id = ? AND hunter_id = ? AND status = 'pending'`,
      [bountyId, claimerId]
    );

    if (existingClaim) {
      return interaction.reply({
        content: "❌ You already have a pending claim for this bounty.",
        ephemeral: true
      });
    }

    // ──────────────────────────────────────
    // Create CLAIM THREAD inside CLAIMS FORUM
    // ──────────────────────────────────────
    const guild = interaction.guild;
    const forum = await getClaimsForumChannel(guild);

    if (!forum) {
      return interaction.reply({
        content: "❌ Claims forum channel is not configured.",
        ephemeral: true
      });
    }

    const threadTitle = `Claim-${interaction.user.username}-${Date.now()}`;

    const thread = await forum.threads.create({
      name: threadTitle,
      message: {
        content: `🧵 **New Bounty Claim Opened**`,
      },
      type: ChannelType.PrivateThread
    });

    // ──────────────────────────────────────
    // Insert claim into DB
    // ──────────────────────────────────────
    const claimRecord = {
      bountyId,
      hunterId: claimerId,
      pokemonId,
      proof,
      status: "pending",
      createdAt: now,
      claimThreadId: thread.id,
      claimMessageId: null
    };

    const claimId = await db.createBountyClaim(claimRecord);

    // ──────────────────────────────────────
    // Build embed for claim
    // ──────────────────────────────────────
    const embed = new EmbedBuilder()
      .setTitle("🔎 Bounty Claim Submitted")
      .addFields(
        { name: "Hunter", value: `<@${claimerId}>`, inline: true },
        { name: "Pokémon ID", value: pokemonId, inline: true },
        { name: "Proof / Notes", value: proof || "*None provided*", inline: false },
        { name: "Claim ID", value: `${claimId}`, inline: false },
        { name: "Bounty ID", value: bountyId, inline: false }
      )
      .setColor("Yellow")
      .setTimestamp();

    // Staff buttons
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

    // Save claimMessageId to DB
    await db.updateBountyClaim(claimId, {
      claim_message_id: claimMessage.id
    });

    return interaction.reply({
      content: "✅ Your claim has been submitted for staff review.",
      ephemeral: true
    });
  }
};
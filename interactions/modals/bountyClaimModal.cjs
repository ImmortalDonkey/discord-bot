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
  // REQUIRED by modalHandler.cjs
  ids: ["bounty_claim_"],

  async execute(client, interaction) {
    const customId = interaction.customId;

    // Format: bounty_claim_<bountyId>_<userId>
    const parts = customId.split("_");
    const bountyId = parts[2];
    const claimerId = parts[3];

    // Safety: ignore if format is invalid
    if (!bountyId || !claimerId) {
      return interaction.reply({
        content: "❌ Invalid claim format.",
        ephemeral: true
      });
    }

    if (interaction.user.id !== claimerId) {
      return interaction.reply({
        content: "❌ You cannot submit a claim for someone else.",
        ephemeral: true
      });
    }

    // Load bounty
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

    const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
    const proof = interaction.fields.getTextInputValue("proof_optional") || "";

    // Check for existing pending claim
    const existing = await db.get(
      `SELECT * FROM bounty_claims
       WHERE bounty_id = ? AND hunter_id = ? AND status = 'pending'`,
      [bountyId, claimerId]
    );

    if (existing) {
      return interaction.reply({
        content: "❌ You already have a pending claim for this bounty.",
        ephemeral: true
      });
    }

    // Find Claims Forum
    const forum = await getClaimsForumChannel(interaction.guild);
    if (!forum) {
      return interaction.reply({
        content: "❌ Claims forum channel is not configured.",
        ephemeral: true
      });
    }

    // Create private thread
    const thread = await forum.threads.create({
      name: `Claim-${interaction.user.username}-${Date.now()}`,
      type: ChannelType.PrivateThread,
      invitable: false,
      message: {
        content: `🧵 **New Bounty Claim Opened**`
      }
    });

    // Save to DB
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

    // Staff review embed
    const embed = new EmbedBuilder()
      .setTitle("🔎 Bounty Claim Submitted")
      .addFields(
        { name: "Hunter", value: `<@${claimerId}>`, inline: true },
        { name: "Pokémon ID", value: pokemonId, inline: true },
        { name: "Proof / Notes", value: proof || "*None provided*" },
        { name: "Claim ID", value: `${claimId}` },
        { name: "Bounty ID", value: `${bountyId}` },
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

    const msg = await thread.send({
      embeds: [embed],
      components: [row]
    });

    await db.updateBountyClaim(claimId, {
      claim_message_id: msg.id
    });

    return interaction.reply({
      content: "✅ Your claim has been submitted for staff review.",
      ephemeral: true
    });
  }
};
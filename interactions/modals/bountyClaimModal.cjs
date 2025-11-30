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
  // IMPORTANT: modalHandler requires ids: []
  ids: ["bounty_claim_"],

  async execute(client, interaction) {
    const customId = interaction.customId;
    const parts = customId.split("_");
    const bountyId = parts[2];
    const claimerId = parts[3];

    if (interaction.user.id !== claimerId) {
      return interaction.reply({
        content: "❌ You cannot submit a claim for someone else.",
        flags: 64
      });
    }

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

    const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
    const proof = interaction.fields.getTextInputValue("proof_optional") || "";

    const existingClaim = await db.get(
      `SELECT * FROM bounty_claims
       WHERE bounty_id = ?
         AND hunter_id = ?
         AND status = 'pending'`,
      [bountyId, claimerId]
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
      invitable: false,
      message: { content: `🧵 **New Bounty Claim Opened**` }
    });

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

    const embed = new EmbedBuilder()
      .setTitle("🔎 Bounty Claim Submitted")
      .addFields(
        { name: "Hunter", value: `<@${claimerId}>`, inline: true },
        { name: "Pokémon ID", value: pokemonId, inline: true },
        { name: "Proof / Notes", value: proof || "*None provided*" },
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
      content: "✅ Your claim has been submitted for staff review.",
      flags: 64
    });
  }
};
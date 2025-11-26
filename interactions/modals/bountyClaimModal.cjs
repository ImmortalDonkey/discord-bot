// interactions/modals/bountyClaimModal.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require("discord.js");

module.exports = {
  idStartsWith: "bountyclaim_",

  async execute(client, interaction) {
    const customId = interaction.customId;
    const bountyId = customId.substring("bountyclaim_".length);

    // These maps will be stored in index.cjs and attached to client
    const activeBounties = client.activeBounties;
    const bountyClaims = client.bountyClaims;

    const bounty = activeBounties.get(bountyId);

    if (!bounty || bounty.completed) {
      return interaction.reply({
        content: "❌ This bounty is no longer active.",
        ephemeral: true
      });
    }

    const now = new Date();
    if (now < bounty.startTime || now > bounty.endTime) {
      return interaction.reply({
        content: "❌ This bounty is not currently active.",
        ephemeral: true
      });
    }

    // =====================
    // Extract user input
    // =====================
    const proof = interaction.fields.getTextInputValue("pokemonProof");
    const claimId = `${bountyId}_${interaction.user.id}_${Date.now()}`;

    const claim = {
      id: claimId,
      bountyId,
      claimerId: interaction.user.id,
      claimerName: interaction.user.username,
      proof,
      createdAt: new Date(),
      status: "pending"
    };
    bountyClaims.set(claimId, claim);

    // ===============================
    // STAFF MENTION
    // ===============================
    const staffRolesEnv = process.env.STAFF_ROLES || "";
    const staffPing = staffRolesEnv
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
      .map(id => `<@&${id}>`)
      .join(" ");

    // ===============================
    // GET CLAIMS FORUM CHANNEL
    // ===============================
    const claimsChannelId =
      process.env.CLAIMS_FORUM_CHANNEL_ID || process.env.CLAIMS_CHANNEL_ID;

    let forum = null;
    try {
      forum = await interaction.guild.channels.fetch(claimsChannelId);
    } catch {}

    if (!forum || forum.type !== ChannelType.GuildForum) {
      return interaction.reply({
        content: "❌ Claims forum channel not found. Contact staff.",
        ephemeral: true
      });
    }

    const firstTarget =
      bounty.pokemons?.length > 0 ? bounty.pokemons[0] : "Bounty";

    // ===============================
    // CLAIM EMBED
    // ===============================
    const embed = new EmbedBuilder()
      .setColor("Gold")
      .setTitle("🎯 New Bounty Claim")
      .setDescription("A bounty claim has been submitted.")
      .addFields(
        { name: "Bounty ID", value: bountyId, inline: true },
        {
          name: "Target(s)",
          value: (bounty.pokemons || []).join("\n") || "Unknown",
          inline: true
        },
        { name: "Claimer", value: `<@${interaction.user.id}>`, inline: false },
        {
          name: "Reward",
          value: `${bounty.reward.toLocaleString()} PKD`,
          inline: false
        },
        { name: "Proof", value: proof || "None", inline: false }
      )
      .setTimestamp();

    // ===============================
    // APPROVE / DENY BUTTONS
    // ===============================
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approvebountyclaim_${bountyId}_${interaction.user.id}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`denybountyclaim_${bountyId}_${interaction.user.id}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    );

    // ===============================
    // CREATE THREAD INSIDE FORUM
    // ===============================
    try {
      const thread = await forum.threads.create({
        name: `Claim • ${firstTarget} • ${interaction.user.username}`,
        message: {
          content: staffPing || "",
          embeds: [embed],
          components: [row]
        }
      });

      // Save thread id
      claim.threadId = thread.id;
      bountyClaims.set(claimId, claim);
    } catch (err) {
      console.error("❌ Failed to create claim thread:", err);
    }

    // ===============================
    // REPLY TO USER
    // ===============================
    return interaction.reply({
      content: "✅ Your claim has been submitted for staff review.",
      ephemeral: true
    });
  }
};


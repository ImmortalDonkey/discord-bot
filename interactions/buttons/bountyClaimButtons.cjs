// interactions/buttons/bountyClaimButtons.cjs
const {
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const db = require("../../database.cjs");

module.exports = {
  ids: ["approveclaim_", "denyclaim_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    const isApprove = id.startsWith("approveclaim_");
    const claimId = id.replace(isApprove ? "approveclaim_" : "denyclaim_", "");

    // Load claim
    const claim = await db.getBountyClaimById(claimId);
    if (!claim) {
      return interaction.reply({
        content: "❌ Claim could not be found.",
        ephemeral: true
      });
    }

    // Load bounty
    const bounty = await db.getBountyById(claim.bounty_id);
    if (!bounty) {
      return interaction.reply({
        content: "❌ Bounty could not be found.",
        ephemeral: true
      });
    }

    // STAFF CHECK
    const member = interaction.member;
    const staffRoles = (process.env.STAFF_ROLES || "")
      .split(",")
      .map(r => r.trim())
      .filter(Boolean);

    const isStaff =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.some(r => staffRoles.includes(r.id));

    if (!isStaff) {
      return interaction.reply({
        content: "❌ You do not have permission to approve or deny claims.",
        ephemeral: true
      });
    }

    // ======================================================================
    // ❌ DENY CLAIM
    // ======================================================================
    if (!isApprove) {
      await db.updateBountyClaim(claimId, {
        status: "denied",
        resolved_at: Date.now(),
        resolver_id: interaction.user.id
      });

      const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("Red")
        .setTitle("❌ Bounty Claim Denied");

      await interaction.update({
        embeds: [deniedEmbed],
        components: []
      });

      // notify in thread
      try {
        const thread = await client.channels.fetch(claim.claim_thread_id);
        await thread.send(`❌ **Claim denied by <@${interaction.user.id}>**`);
      } catch {}

      return;
    }

    // ======================================================================
    // ✔ APPROVE CLAIM
    // ======================================================================

    // Mark claim as approved
    await db.updateBountyClaim(claimId, {
      status: "approved",
      resolved_at: Date.now(),
      resolver_id: interaction.user.id
    });

    // Mark bounty as completed
    await db.updateBounty(bounty.id, {
      status: "completed",
      winner_id: claim.hunter_id,
      winner_claim_id: claimId
    });

    // Update embed
    const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("Green")
      .setTitle("✔ Claim Approved");

    await interaction.update({
      embeds: [approvedEmbed],
      components: []
    });

    // Remove "Claim Bounty" button from the bounty card
    try {
      const cardChannel = await client.channels.fetch(bounty.card_channel_id);
      const cardMsg = await cardChannel.messages.fetch(bounty.card_message_id);
      await cardMsg.edit({ components: [] });
    } catch (err) {
      console.warn("⚠ Could not update bounty card:", err.message);
    }

    // DM hunter
    try {
      const hunter = await client.users.fetch(claim.hunter_id);
      await hunter.send(
        `🎉 Your **bounty claim** for **${JSON.parse(bounty.pokemons)[0]}** has been approved!\n` +
        `🏆 Reward: **${Number(bounty.reward).toLocaleString()} PKD**\n` +
        `🆔 Claim ID: ${claimId}`
      );
    } catch {}

    // Post update to the claim thread
    try {
      const thread = await client.channels.fetch(claim.claim_thread_id);
      await thread.send(`✔ **Claim approved by <@${interaction.user.id}>**`);
    } catch {}
  }
};
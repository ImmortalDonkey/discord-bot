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
    const bounty = await db.getBountyById(claim.bountyId);
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
        resolvedAt: Date.now(),
        resolverId: interaction.user.id
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
        const thread = await client.channels.fetch(claim.claimThreadId);
        await thread.send(`❌ **Claim denied by <@${interaction.user.id}>**`);
      } catch {}

      return;
    }

    // ======================================================================
    // ✔ APPROVE CLAIM
    // ======================================================================

    await db.updateBountyClaim(claimId, {
      status: "approved",
      resolvedAt: Date.now(),
      resolverId: interaction.user.id
    });

    // complete bounty
    await db.updateBounty(bounty.id, {
      status: "completed",
      winnerId: claim.hunterId,
      winnerClaimId: claimId
    });

    // Update embed
    const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("Green")
      .setTitle("✔ Claim Approved");

    await interaction.update({
      embeds: [approvedEmbed],
      components: []
    });

    // Remove button from bounty card
    try {
      if (bounty.cardChannelId && bounty.cardMessageId) {
        const channel = await client.channels.fetch(bounty.cardChannelId);
        const msg = await channel.messages.fetch(bounty.cardMessageId);
        await msg.edit({ components: [] });
      }
    } catch (err) {
      console.warn("⚠ Could not update bounty card:", err.message);
    }

    // DM user
    try {
      const hunter = await client.users.fetch(claim.hunterId);
      const firstTarget = (bounty.pokemons && bounty.pokemons[0]) || "your target";

      await hunter.send(
        `🎉 Your **bounty claim** for **${firstTarget}** has been approved!\n` +
        `🏆 Reward: **${Number(bounty.reward).toLocaleString()} PKD**\n` +
        `🆔 Claim ID: ${claimId}`
      );
    } catch {}

    // Notify in thread + DELETE after 1 minute
    try {
      const thread = await client.channels.fetch(claim.claimThreadId);

      await thread.send(
        `✔ **Claim approved by <@${interaction.user.id}>**\n` +
        `🕒 This thread will be deleted in **1 minute**.`
      );

      // AUTO DELETE
      setTimeout(async () => {
        try {
          await thread.delete();
        } catch (err) {
          console.warn("⚠ Failed to delete claim thread:", err.message);
        }
      }, 60000);

    } catch (err) {
      console.warn("⚠ Could not update claim thread:", err.message);
    }
  }
};

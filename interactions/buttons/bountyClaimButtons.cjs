// interactions/buttons/bountyClaimButtons.cjs
const {
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const db = require("../../database.cjs");
const { createBountyCardEnd } = require("../../renderers/bountyCardEnd.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");

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

    // Mark bounty completed
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

    // ======================================================================
    // REMOVE ORIGINAL BOUNTY CARD AND POST COMPLETED END CARD (NO PINGS)
    // ======================================================================
    try {
      const guild = interaction.guild;
      const channel = await guild.channels.fetch(bounty.cardChannelId);
      const original = await channel.messages.fetch(bounty.cardMessageId).catch(() => null);

      // Delete the current bounty card
      if (original) await original.delete().catch(() => {});

      // Build the new completed card
      const member = await guild.members.fetch(claim.hunterId).catch(() => null);

      const username =
        member?.nickname ||
        member?.user?.username ||
        "Trainer";

      const avatarUrl =
        member?.displayAvatarURL({ extension: "png", size: 512 }) ||
        guild.iconURL({ extension: "png", size: 512 });

      // Rank
      let rankName = "Rookie Trainer";
      try {
        const dbUser = await db.getUserById(claim.hunterId);
        const lifetime = dbUser?.lifetime_points ?? dbUser?.points ?? 0;
        rankName = getRankName(lifetime);
      } catch {}

      const rewardLabel = `${Number(bounty.reward || 0).toLocaleString()} PKD`;
      const pokemons = bounty.pokemons || [];

      // Generate end-card buffer
      const cardBuffer = await createBountyCardEnd({
        bountyId: bounty.id,
        username,
        rankName,
        pokemons,
        rewardLabel,
        avatarUrl,
        mode: "completed"
      });

      // Post WITHOUT ANY PINGS, NO CONTENT
      await channel.send({
        files: [{
          attachment: cardBuffer,
          name: `bountyEnd_${bounty.id}.png`
        }]
      });

    } catch (err) {
      console.warn("⚠ Could not generate completed bounty card:", err.message);
    }

    // ======================================================================
    // NOTIFY + DELETE THREAD
    // ======================================================================
    try {
      const thread = await client.channels.fetch(claim.claimThreadId);

      await thread.send(
        `✔ **Claim approved by <@${interaction.user.id}>**\n` +
        `🕒 This thread will be deleted in **1 minute**.`
      );

      setTimeout(async () => {
        await thread.delete().catch(() => {});
      }, 60000);

    } catch (err) {
      console.warn("⚠ Could not update claim thread:", err.message);
    }
  }
};
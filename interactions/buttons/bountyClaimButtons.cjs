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
    try {
      const id = interaction.customId;
      const isApprove = id.startsWith("approveclaim_");
      const claimId = id.replace(isApprove ? "approveclaim_" : "denyclaim_", "");

      // ===============================
      // LOAD CLAIM
      // ===============================
      const claim = await db.getBountyClaimById(claimId);
      if (!claim) {
        return interaction.reply({
          content: "❌ Claim could not be found.",
          ephemeral: true
        });
      }

      // ===============================
      // LOAD BOUNTY
      // ===============================
      const bounty = await db.getBountyById(claim.bountyId);
      if (!bounty) {
        return interaction.reply({
          content: "❌ Bounty could not be found.",
          ephemeral: true
        });
      }

      // ===============================
      // STAFF PERMISSION CHECK
      // ===============================
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

      // ===============================
      // 🔴 DENY CLAIM
      // ===============================
      if (!isApprove) {
        await db.updateBountyClaim(claimId, {
          status: "denied",
          resolvedAt: Date.now(),
          resolverId: interaction.user.id
        });

        const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor("Red")
          .setTitle("❌ Bounty Claim Denied");

        // Remove buttons
        await interaction.update({
          embeds: [deniedEmbed],
          components: []
        });

        // Notify thread
        try {
          const t = await client.channels.fetch(claim.claimThreadId);
          await t.send(`❌ **Claim denied by <@${interaction.user.id}>**`);
        } catch {}

        return;
      }

      // ===============================
      // 🟢 APPROVE CLAIM
      // ===============================
      await db.updateBountyClaim(claimId, {
        status: "approved",
        resolvedAt: Date.now(),
        resolverId: interaction.user.id
      });

      await db.updateBounty(bounty.id, {
        status: "completed",
        winnerId: claim.hunterId,
        winnerClaimId: claimId
      });

      // Update embed in claim thread
      const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("Green")
        .setTitle("✔ Claim Approved");

      await interaction.update({
        embeds: [approvedEmbed],
        components: [] // remove approve/deny buttons
      });

      // ===============================
      // DELETE ORIGINAL CARD + POST END CARD
      // ===============================
      try {
        const guild = interaction.guild;
        const channel = await guild.channels.fetch(bounty.cardChannelId);
        const original = await channel.messages
          .fetch(bounty.cardMessageId)
          .catch(() => null);

        if (original) await original.delete().catch(() => {});

        // Fetch winner display info
        const winner = await guild.members.fetch(claim.hunterId).catch(() => null);

        const username =
          winner?.nickname ||
          winner?.user?.username ||
          "Trainer";

        const avatarUrl =
          winner?.displayAvatarURL({ extension: "png", size: 512 }) ||
          guild.iconURL({ extension: "png", size: 512 }) ||
          null;

        // Rank
        let rankName = "Rookie Trainer";
        try {
          const dbUser = await db.getUserById(claim.hunterId);
          const lifetime = dbUser?.lifetime_points ?? dbUser?.points ?? 0;
          rankName = getRankName(lifetime);
        } catch {}

        const rewardLabel = `${Number(bounty.reward || 0).toLocaleString()} PKD`;

        // END CARD BUFFER
        const cardBuffer = await createBountyCardEnd({
          mode: "completed",
          bountyId: bounty.id,
          username,
          rankName,
          pokemons: bounty.pokemons || [],
          rewardLabel,
          avatarUrl
        });

        // Post without pings
        await channel.send({
          files: [{
            attachment: cardBuffer,
            name: `bountyEnd_${bounty.id}.png`
          }]
        });

      } catch (err) {
        console.warn("⚠ Could not generate completed bounty card:", err.message);
      }

      // ===============================
      // THREAD NOTIFY + AUTO DELETE
      // ===============================
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

    catch (err) {
      console.error("❌ Claim button error:", err);
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: "❌ An internal error occurred.",
          ephemeral: true
        });
      }
    }
  }
};
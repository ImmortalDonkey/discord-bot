// interactions/buttons/bountyClaimButtons.cjs
const {
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const db = require("../../database.cjs");
const { createBountySuccessCard } = require("../../renderers/bountyCardSuccess.cjs");
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
    const bounty = await db.getBountyById(claim.bounty_id || claim.bountyId);
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

    // ───────────────────────────────────────
    // ❌ DENY CLAIM
    // ───────────────────────────────────────
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

      try {
        const thread = await client.channels.fetch(
          claim.claim_thread_id || claim.claimThreadId
        );
        await thread.send(`❌ **Claim denied by <@${interaction.user.id}>**`);
      } catch {}

      return;
    }

    // ───────────────────────────────────────
    // ✔ APPROVE CLAIM
    // ───────────────────────────────────────
    await db.updateBountyClaim(claimId, {
      status: "approved",
      resolved_at: Date.now(),
      resolver_id: interaction.user.id
    });

    await db.updateBounty(bounty.id, {
      status: "completed",
      winner_id: claim.hunter_id || claim.hunterId,
      winner_claim_id: claimId
    });

    const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("Green")
      .setTitle("✔ Claim Approved");

    await interaction.update({
      embeds: [approvedEmbed],
      components: []
    });

    // ───────────────────────────────────────
    // REMOVE OLD CARD (PIN FIRST) + POST COMPLETED CARD
    // ───────────────────────────────────────
    try {
      const guild = interaction.guild;
      const channel = await guild.channels.fetch(
        bounty.card_channel_id || bounty.cardChannelId
      );

      const original = bounty.card_message_id || bounty.cardMessageId
        ? await channel.messages
            .fetch(bounty.card_message_id || bounty.cardMessageId)
            .catch(() => null)
        : null;

      // 👉 Pin the ORIGINAL bounty card, then delete it
      if (original) {
        try {
          await original.pin().catch(() => {});
        } catch {}
        await original.delete().catch(() => {});
      }

      // Winner member / nickname
      const winnerId = claim.hunter_id || claim.hunterId;
      const winnerMember = await guild.members.fetch(winnerId).catch(() => null);

      const username =
        winnerMember?.nickname ||
        winnerMember?.displayName ||
        winnerMember?.user?.username ||
        "Trainer";

      const avatarUrl =
        winnerMember?.displayAvatarURL({ extension: "png", size: 512 }) ||
        guild.iconURL({ extension: "png", size: 512 });

      // Rank for winner
      let rankName = "Rookie Trainer";
      try {
        const dbUser = await db.getUserById(winnerId);
        const lifetime = dbUser?.lifetime_points ?? dbUser?.points ?? 0;
        rankName = getRankName(lifetime);
      } catch {}

      const rewardLabel = `${Number(bounty.reward || 0).toLocaleString()} PKD`;

      const pokemons =
        bounty.pokemons ||
        (typeof bounty.pokemons_json === "string"
          ? JSON.parse(bounty.pokemons_json)
          : []);

      const cardBuffer = await createBountySuccessCard({
        bountyId: bounty.id,
        username,
        rankName,
        pokemons,
        rewardLabel,
        avatarUrl,
        rarityLabel: bounty.rarity_label || bounty.rarityLabel
      });

      const completedMsg = await channel.send({
        files: [
          {
            attachment: cardBuffer,
            name: `bountyEnd_${bounty.id}_success.png`
          }
        ]
      });

      // ❌ No pin on completed card (per your latest message)

      // DM the user about their reward
      try {
        if (winnerMember) {
          await winnerMember.send({
            content: `🎉 **Your bounty claim has been approved!**\nYou earned **${rewardLabel}**.\n\nGreat work, ${username}!`
          });
        }
      } catch {
        console.warn("⚠ Could not DM user (DMs closed).");
      }

    } catch (err) {
      console.warn(
        "⚠ Could not generate or send completed bounty card:",
        err.message
      );
    }

    // ───────────────────────────────────────
    // NOTIFY THREAD + DELETE AFTER 1 MIN
    // ───────────────────────────────────────
    try {
      const thread = await client.channels.fetch(
        claim.claim_thread_id || claim.claimThreadId
      );

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

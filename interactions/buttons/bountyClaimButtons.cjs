// interactions/buttons/bountyClaimButtons.cjs
const {
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const { createBountyCard } = require("../../renderers/cardRenderer.cjs");
const db = require("../../database.cjs");

module.exports = {
  ids: [
    "approvebountyclaim_",
    "denybountyclaim_"
  ],

  async execute(client, interaction) {
    const id = interaction.customId;

    const pending = client.pendingBounties || global.pendingBounties;
    const active = client.activeBounties || global.activeBounties;
    const completed = client.completedBounties || global.completedBounties;

    const isApprove = id.startsWith("approvebountyclaim_");
    const prefix = isApprove ? "approvebountyclaim_" : "denybountyclaim_";

    // Format: approvebountyclaim_bountyId_userId
    const [_, bountyId, claimerId] = id.split("_");

    const bounty = active.get(bountyId);
    if (!bounty) {
      return interaction.reply({
        content: "❌ This bounty is no longer active.",
        ephemeral: true
      });
    }

    // ============================
    // 🔐 STAFF PERMISSION CHECK
    // ============================
    const staffRolesEnv = process.env.STAFF_ROLES || "";
    const staffRoles = staffRolesEnv.split(",").map(r => r.trim()).filter(Boolean);
    const memberRoles = interaction.member.roles.cache.map(r => r.id);

    const isStaff = staffRoles.some(r => memberRoles.includes(r)) ||
      interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isStaff) {
      return interaction.reply({
        content: "❌ You do not have permission to process bounty claims.",
        ephemeral: true
      });
    }

    // ============================
    // ❌ DENY CLAIM
    // ============================
    if (!isApprove) {
      const embed = EmbedBuilder.from(interaction.message.embeds[0] || new EmbedBuilder())
        .setColor("Red")
        .setTitle("❌ Bounty Claim Denied");

      // Remove buttons
      await interaction.message.edit({ embeds: [embed], components: [] });

      return interaction.reply({
        content: "❌ Bounty claim denied.",
        ephemeral: true
      });
    }

    // ============================
    // ✔ APPROVE CLAIM
    // ============================
    const user = await db.getUserById(claimerId);

    const reward = bounty.reward || 0;
    const rarityLabel = bounty.rarityLabel;
    const rankName = user?.rank_name || "Unranked";

    // Add points
    await db.addPoints(
      claimerId,
      user?.username,
      reward,
      `Bounty Completion: ${bounty.pokemon1}`
    );

    // Remove from active → move to completed
    active.delete(bountyId);
    completed.set(bountyId, {
      ...bounty,
      completedBy: claimerId,
      completedAt: Date.now()
    });

    // ============================
    // DELETE ACTIVE BOUNTY CARD
    // ============================
    try {
      const channel = await client.channels.fetch(bounty.activeChannelId);
      const msg = await channel.messages.fetch(bounty.activeMessageId);
      await msg.delete().catch(() => {});
    } catch (e) {
      console.warn("Could not delete active bounty card:", e);
    }

    // ============================
    // 🎨 RENDER COMPLETED CARD
    // ============================
    let filePath = null;
    try {
      filePath = await createBountyCard({
        bountyId,
        username: user?.username,
        rankName: rankName,
        rarityKey: bounty.rarityKey,
        rarityLabel: bounty.rarityLabel,
        pokemons: [bounty.pokemon1, bounty.pokemon2, bounty.pokemon3].filter(p => p),
        startLabel: bounty.startLabel,
        endLabel: bounty.endLabel,
        durationLabel: bounty.durationLabel,
        note: bounty.notes,
        rewardLabel: `${reward.toLocaleString()} PKD`,
        avatarUrl: `https://cdn.discordapp.com/avatars/${claimerId}/${user?.avatar}.png?size=256`
      });
    } catch (e) {
      console.error("CARD RENDER ERROR:", e);
    }

    // ============================
    // SEND COMPLETED BOUNTY CARD
    // ============================
    try {
      const completionChannel = await client.channels.fetch(bounty.completionChannelId);

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("🎉 Bounty Completed!")
        .setDescription(
          `<@${claimerId}> has completed the bounty for **${bounty.pokemon1}**!\n\n` +
          `**Reward:** ${reward.toLocaleString()} PKD\n` +
          `**Trainer Rank:** ${rankName}`
        )
        .setTimestamp();

      if (filePath) {
        await completionChannel.send({
          embeds: [embed],
          files: [filePath]
        });
      } else {
        await completionChannel.send({ embeds: [embed] });
      }

    } catch (err) {
      console.error("Error sending completed bounty card:", err);
    }

    // ============================
    // UPDATE CLAIM THREAD
    // ============================
    try {
      if (bounty.claimThreadId) {
        const thread = await client.channels.fetch(bounty.claimThreadId);
        await thread.send(`✔ **Claim approved by <@${interaction.user.id}>.**`);
      }
    } catch {}

    // ============================
    // CONFIRMATION
    // ============================
    const finalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("Green")
      .setTitle("✔ Bounty Claim Approved");

    await interaction.message.edit({
      embeds: [finalEmbed],
      components: []
    });

    return interaction.reply({
      content: "✔ Bounty claim approved successfully.",
      ephemeral: true
    });
  }
};


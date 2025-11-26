// interactions/buttons/claimButtons.cjs
const { EmbedBuilder } = require("discord.js");
const db = require("../../database.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");

module.exports = {
  // Match any button starting with these prefixes
  ids: [
    "claim_approve_",  
    "claim_deny_"
  ],

  async execute(client, interaction) {
    const customId = interaction.customId;
    const member = interaction.member;

    // Staff-only
    if (!member.permissions.has("Administrator")) {
      return interaction.reply({
        content: "❌ Only staff can approve/deny claims.",
        ephemeral: true
      });
    }

    // Format:  claim_approve_<threadId>
    //          claim_deny_<threadId>
    const [_, action, threadId] = customId.split("_");

    const claim = client.bountyClaims?.get(threadId);

    if (!claim) {
      return interaction.reply({
        content: "❌ Claim data not found. It may have already been processed.",
        ephemeral: true
      });
    }

    const userId = claim.userId;
    const points = claim.points;
    const pkdValue = claim.pkd;

    const user = await interaction.client.users.fetch(userId).catch(() => null);
    const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);

    if (!thread) {
      return interaction.reply({
        content: "❌ Thread not found.",
        ephemeral: true
      });
    }

    if (claim.status !== "pending") {
      return interaction.reply({
        content: `⚠ This claim was already **${claim.status}**.`,
        ephemeral: true
      });
    }

    // ----------------------------------------
    // APPROVE
    // ----------------------------------------
    if (action === "approve") {
      claim.status = "approved";

      // Deduct points
      await db.addPoints(userId, user?.username || "Unknown", -points, "Claim approved");

      // DM the user
      if (user) {
        user.send(
          `✅ Your claim for **${points} points** (${pkdValue.toLocaleString()} pkd) has been **approved**.\nThe points have been deducted.`
        ).catch(() => {});
      }

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("Claim Approved")
        .addFields(
          { name: "User", value: `<@${userId}>`, inline: true },
          { name: "Points Deducted", value: `${points}`, inline: true },
          { name: "PKD Value", value: `${pkdValue.toLocaleString()} pkd`, inline: true }
        )
        .setFooter({ text: `Approved by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.update({
        content: `✅ Claim approved b

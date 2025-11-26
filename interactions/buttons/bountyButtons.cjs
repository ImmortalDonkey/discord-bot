// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

module.exports = {
  ids: ["approvebounty_", "denybounty_"],

  async execute(client, interaction) {
    const customId = interaction.customId;
    const parts = customId.split("_");

    // FIXED — properly reconstruct the bountyId
    const actionRaw = parts[0];            // "approvebounty" or "denybounty"
    const bountyId = parts.slice(1).join("_"); // "timestamp_userid"

    const isApprove = actionRaw === "approvebounty";
    const isDeny = actionRaw === "denybounty";

    const bounty = client.pendingBounties.get(bountyId);

    if (!bounty) {
      return interaction.reply({
        content: "❌ Could not find that bounty. It may have already been processed.",
        ephemeral: true
      });
    }

    // We want to reply fast
    await interaction.deferReply({ ephemeral: true });

    // Fetch the guild channel for live bounty posts
    const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
    const bountyChannel = await interaction.guild.channels.fetch(bountyChannelId).catch(() => null);

    if (!bountyChannel) {
      return interaction.editReply({
        content: "❌ Could not find the bounty channel. Check BOUNTY_CHANNEL_ID."
      });
    }

    // ---------------------------
    // DENY BOUNTY
    // ---------------------------
    if (isDeny) {
      client.pendingBounties.delete(bountyId);

      await interaction.message.edit({
        content: "❌ **Bounty Denied by staff.**",
        embeds: interaction.message.embeds,
        components: [] // remove buttons
      });

      return interaction.editReply({
        content: "❌ Bounty denied."
      });
    }

    // ---------------------------
    // APPROVE BOUNTY
    // ---------------------------
    if (isApprove) {
      client.pendingBounties.delete(bountyId);

      // Format embed
      const startUnix = Math.floor(bounty.startTime.getTime() / 1000);
      const endUnix = Math.floor(bounty.endTime.getTime() / 1000);

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("🎯 Active Bounty")
        .setDescription("A bounty has been approved and is now live!")
        .addFields(
          { name: "Requester", value: `<@${bounty.requesterId}>`, inline: true },
          { name: "Reward", value: `${bounty.reward.toLocaleString()} PKD`, inline: true },
          { name: "Targets", value: bounty.pokemons.map(p => `• ${p}`).join("\n") || "None" },
          { name: "Start", value: `<t:${startUnix}:F>`, inline: true },
          { name: "End", value: `<t:${endUnix}:F>`, inline: true },
          { name: "Notes", value: bounty.notes || "No notes provided." }
        )
        .setTimestamp();

      // Claim button
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claimbounty_${bounty.id}`)
          .setLabel("Claim Bounty")
          .setStyle(ButtonStyle.Primary)
      );

      // Post live bounty
      await bountyChannel.send({
        embeds: [embed],
        components: [row]
      });

      // Update original approval message
      await interaction.message.edit({
        content: "✅ **Bounty Approved**",
        embeds: interaction.message.embeds,
        components: []
      });

      return interaction.editReply({
        content: "✅ Bounty approved and posted!"
      });
    }
  }
};

// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const renderBountyCard = require("../../renderers/cardRenderer.cjs");

module.exports = {
  // These prefix IDs match the buttons created in bountyrequest.cjs
  ids: ["approvebounty_", "denybounty_", "claimbounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // --------------------------------------------------------------------
    // 1. APPROVE BOUNTY
    // --------------------------------------------------------------------
    if (id.startsWith("approvebounty_")) {
      const bountyId = id.replace("approvebounty_", "");
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ Could not find that bounty. It may already be processed.",
          ephemeral: true,
        });
      }

      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      // -----------------------------
      // Render IMAGE CARD (legacy)
      // -----------------------------
      const buffer = await renderBountyCard(bounty);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claimbounty_${bountyId}`)
          .setLabel("Claim Bounty")
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({
        content: "📢 **Bounty Approved!**",
        ephemeral: false,
      });

      // SEND TO BOUNTY CHANNEL
      const channelId = process.env.BOUNTY_CHANNEL_ID;
      const channel = interaction.guild.channels.cache.get(channelId);

      await channel.send({
        files: [{ attachment: buffer, name: "bounty-card.png" }],
        components: [row],
      });

      return;
    }

    // --------------------------------------------------------------------
    // 2. DENY BOUNTY
    // --------------------------------------------------------------------
    if (id.startsWith("denybounty_")) {
      const bountyId = id.replace("denybounty_", "");
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ Could not find that bounty.",
          ephemeral: true,
        });
      }

      client.pendingBounties.delete(bountyId);

      return interaction.reply({
        content: "❌ Bounty denied.",
        ephemeral: false,
      });
    }

    // --------------------------------------------------------------------
    // 3. CLAIM BOUNTY
    // --------------------------------------------------------------------
    if (id.startsWith("claimbounty_")) {
      const bountyId = id.replace("claimbounty_", "");
      const bounty = client.activeBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty is no longer active.",
          ephemeral: true,
        });
      }

      const userId = interaction.user.id;

      // Prevent duplicate claims
      if (!client.bountyClaims.has(bountyId)) {
        client.bountyClaims.set(bountyId, new Set());
      }
      const claimSet = client.bountyClaims.get(bountyId);

      if (claimSet.has(userId)) {
        return interaction.reply({
          content: "⚠ You have already claimed this bounty.",
          ephemeral: true,
        });
      }

      claimSet.add(userId);

      return interaction.reply({
        content: "📝 Claim submitted! Staff will verify shortly.",
        ephemeral: true,
      });
    }
  },
};

// interactions/buttons/bountyButtons.cjs
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const { createBountyCard } = require("../../renderers/cardRenderer.cjs");
const {
  getHighestRarityForList,
  getRarityDisplayLabel
} = require("../../utils/rarity.cjs");
const { buildBountyCardOptions } = require("../../utils/bountyScheduler.cjs");

module.exports = {
  ids: ["approvebounty_", "denybounty_", "claimbounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // -------------------------------------------------------
    // 🟢 APPROVE BOUNTY
    // -------------------------------------------------------
    if (id.startsWith("approvebounty_")) {
      const bountyId = id.replace("approvebounty_", "");
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty no longer exists.",
          flags: 64
        });
      }

      // Convert timestamp fields back into Date objects
      bounty.startTime = new Date(bounty.startTime);
      bounty.endTime = new Date(bounty.endTime);

      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      // -------------------------------------------------------
      // BUILD CARD PNG (NEW SYSTEM)
      // -------------------------------------------------------
      const cardOptions = await buildBountyCardOptions(client, bounty, interaction.guild);
      const cardPath = await createBountyCard(cardOptions);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claimbounty_${bountyId}`)
          .setLabel("Claim Bounty")
          .setStyle(ButtonStyle.Success)
      );

      // SEND TO BOUNTY CHANNEL
      const channelId = process.env.BOUNTY_CHANNEL_ID;
      const channel = interaction.guild.channels.cache.get(channelId);

      if (!channel) {
        return interaction.reply({
          content: "❌ BOUNTY_CHANNEL_ID not found.",
          flags: 64
        });
      }

      await channel.send({
        files: [cardPath],
        components: [row]
      });

      return interaction.reply({
        content: "📢 **Bounty Approved!** Card posted.",
        flags: 64
      });
    }

    // -------------------------------------------------------
    // 🔴 DENY BOUNTY
    // -------------------------------------------------------
    if (id.startsWith("denybounty_")) {
      const bountyId = id.replace("denybounty_", "");

      client.pendingBounties.delete(bountyId);

      return interaction.reply({
        content: "❌ Bounty denied.",
        flags: 64
      });
    }

    // -------------------------------------------------------
    // 🟡 CLAIM BOUNTY
    // -------------------------------------------------------
    if (id.startsWith("claimbounty_")) {
      const bountyId = id.replace("claimbounty_", "");
      const bounty = client.activeBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty is no longer active.",
          flags: 64
        });
      }

      return interaction.showModal({
        customId: `bounty_claim_${bountyId}_${interaction.user.id}`,
        title: "Submit Claim",
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                customId: "pokemon_id",
                label: "Pokémon ID (required)",
                style: 1,
                required: true
              }
            ]
          },
          {
            type: 1,
            components: [
              {
                type: 4,
                customId: "proof_optional",
                label: "Screenshot / Notes (optional)",
                style: 2,
                required: false
              }
            ]
          }
        ]
      });
    }
  }
};
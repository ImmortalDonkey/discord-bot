// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

// Correct import — cardRenderer exports "createBountyCard"
const { createBountyCard } = require("../../renderers/cardRenderer.cjs");

module.exports = {
  ids: ["approvebounty_", "denybounty_", "claimbounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // ================================================================
    // 1. APPROVE BOUNTY
    // ================================================================
    if (id.startsWith("approvebounty_")) {
      const bountyId = id.replace("approvebounty_", "");
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ Could not find that bounty. It may already be processed.",
          ephemeral: true,
        });
      }

      // Move → active
      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      // ---------------------------
      // Immediate start?
      // ---------------------------
      const now = Date.now();
      const startsNow = bounty.startsNow || bounty.startTime <= now;

      // Get channels
      const bountyChannel = interaction.guild.channels.cache.get(process.env.BOUNTY_CHANNEL_ID);
      const announceChannel = interaction.guild.channels.cache.get(process.env.BOUNTY_ANNOUNCE_CHANNEL_ID);

      if (!bountyChannel) {
        return interaction.reply({
          content: "⚠ No bounty channel configured.",
          ephemeral: true
        });
      }

      // ---------------------------
      // If scheduled → post announcement only
      // ---------------------------
      if (!startsNow) {

        // Ping correct rarity group
        const rarityKey = client.getHighestRarityForList(bounty.pokemons);
        const pingRole = process.env[`ROLE_${rarityKey.toUpperCase()}`] || process.env.ROLE_BOUNTY_ALL || "";

        const embed = new EmbedBuilder()
          .setTitle("📢 Upcoming Bounty Scheduled")
          .setDescription(`A bounty will begin soon once the scheduled start time arrives.`)
          .addFields(
            { name: "Trainer", value: `<@${bounty.requesterId}>`, inline: true },
            { name: "Pokémon", value: bounty.pokemons.join("\n"), inline: false },
            { name: "Rarity", value: client.getRarityDisplayLabel(rarityKey), inline: true },
            { name: "Starts", value: `<t:${Math.floor(bounty.startTime / 1000)}:F>`, inline: true },
            { name: "Reward", value: `${bounty.reward.toLocaleString()} PKD`, inline: false }
          )
          .setColor(0xffcc00);

        await interaction.reply({ content: "📡 Bounty approved and scheduled.", ephemeral: true });

        const msg = await announceChannel.send({
          content: `<@&${pingRole}>`,
          embeds: [embed]
        });

        // store announcement message so scheduler can delete it later
        bounty.announcementMessageId = msg.id;

        return;
      }

      // ---------------------------------
      // If starts immediately → create card
      // ---------------------------------
      const buffer = await createBountyCard(bounty);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claimbounty_${bountyId}`)
          .setLabel("Claim Bounty")
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({
        content: "📢 **Bounty Approved & Activated!**",
        ephemeral: true,
      });

      const msg = await bountyChannel.send({
        files: [{ attachment: buffer, name: "bounty-card.png" }],
        components: [row],
      });

      bounty.messageId = msg.id;
      bounty.channelId = bountyChannel.id;

      client.activeBounties.set(bountyId, bounty);
      return;
    }

    // ================================================================
    // 2. DENY BOUNTY
    // ================================================================
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
        ephemeral: true,
      });
    }

    // ================================================================
    // 3. CLAIM BOUNTY → Modal + Claim Thread
    // ================================================================
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

      // ---------------------------
      // Show claim modal
      // ---------------------------
      const modal = new ModalBuilder()
        .setCustomId(`claimmodal_${bountyId}`)
        .setTitle("Submit Bounty Claim");

      const pokemonIdInput = new TextInputBuilder()
        .setCustomId("pokemonId")
        .setLabel("Pokémon ID (required)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const screenshotInput = new TextInputBuilder()
        .setCustomId("screenshot")
        .setLabel("Screenshot URL (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(pokemonIdInput),
        new ActionRowBuilder().addComponents(screenshotInput)
      );

      return interaction.showModal(modal);
    }
  },
};
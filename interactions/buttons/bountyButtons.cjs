const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

// Correct card import
const { createBountyCard } = require("../../renderers/cardRenderer.cjs");

module.exports = {
  ids: ["approvebounty_", "denybounty_", "claimbounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // ======================================================================
    // 1. APPROVE
    // ======================================================================
    if (id.startsWith("approvebounty_")) {
      const bountyId = id.replace("approvebounty_", "");
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ Could not find that bounty.",
          ephemeral: true
        });
      }

      // --- SAFETY PATCH ---
      bounty.pokemons = bounty.pokemons || [];
      if (!Array.isArray(bounty.pokemons)) bounty.pokemons = [];

      // Ensure start / end exist
      if (!bounty.startTime) bounty.startTime = new Date();
      if (!bounty.endTime) {
        bounty.endTime = new Date(bounty.startTime.getTime() + (bounty.durationHours || 1) * 3600000);
      }

      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      // Determine rarity safely
      let rarityKey = "common";
      try {
        rarityKey = client.getHighestRarityForList(bounty.pokemons);
      } catch (err) {
        console.error("RARITY ERROR:", err);
      }

      const now = Date.now();
      const startsNow = bounty.startsNow || bounty.startTime <= now;

      const bountyChannel = interaction.guild.channels.cache.get(process.env.BOUNTY_CHANNEL_ID);
      const announceChannel = interaction.guild.channels.cache.get(process.env.BOUNTY_ANNOUNCE_CHANNEL_ID);

      if (!bountyChannel) {
        return interaction.reply({ content: "⚠ No bounty channel configured.", ephemeral: true });
      }

      // ------------------------------------------------------------------
      // SCHEDULED BOUNTY → Announcement only
      // ------------------------------------------------------------------
      if (!startsNow) {
        const pingRole =
          process.env[`ROLE_${rarityKey.toUpperCase()}`] ||
          process.env.ROLE_BOUNTY_ALL ||
          null;

        const embed = new EmbedBuilder()
          .setTitle("📢 Upcoming Bounty Scheduled")
          .setDescription("This bounty will begin at the scheduled time.")
          .addFields(
            { name: "Trainer", value: `<@${bounty.requesterId}>`, inline: true },
            { name: "Pokémon", value: bounty.pokemons.join("\n") || "None", inline: false },
            { name: "Starts", value: `<t:${Math.floor(bounty.startTime / 1000)}:F>`, inline: true },
            { name: "Reward", value: `${bounty.reward.toLocaleString()} PKD`, inline: true }
          )
          .setColor(0xffcc00);

        await interaction.reply({ content: "📡 Bounty approved and scheduled.", ephemeral: true });

        const msg = await announceChannel.send({
          content: pingRole ? `<@&${pingRole}>` : "",
          embeds: [embed]
        });

        bounty.announcementMessageId = msg.id;
        client.activeBounties.set(bountyId, bounty);
        return;
      }

      // ------------------------------------------------------------------
      // IMMEDIATE START → Send Card
      // ------------------------------------------------------------------
      const buffer = await createBountyCard(bounty);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claimbounty_${bountyId}`)
          .setLabel("Claim Bounty")
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({
        content: "📢 Bounty approved and activated!",
        ephemeral: true
      });

      const msg = await bountyChannel.send({
        files: [{ attachment: buffer, name: "bounty-card.png" }],
        components: [row]
      });

      bounty.messageId = msg.id;
      bounty.channelId = bountyChannel.id;

      client.activeBounties.set(bountyId, bounty);
      return;
    }

    // ======================================================================
    // 2. DENY
    // ======================================================================
    if (id.startsWith("denybounty_")) {
      const bountyId = id.replace("denybounty_", "");
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ Could not find that bounty.",
          ephemeral: true
        });
      }

      client.pendingBounties.delete(bountyId);
      return interaction.reply({ content: "❌ Bounty denied.", ephemeral: true });
    }

    // ======================================================================
    // 3. CLAIM
    // ======================================================================
    if (id.startsWith("claimbounty_")) {
      const bountyId = id.replace("claimbounty_", "");
      const bounty = client.activeBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty is no longer active.",
          ephemeral: true
        });
      }

      const userId = interaction.user.id;

      if (!client.bountyClaims.has(bountyId)) {
        client.bountyClaims.set(bountyId, new Set());
      }

      const set = client.bountyClaims.get(bountyId);
      if (set.has(userId)) {
        return interaction.reply({
          content: "⚠ You already submitted a claim for this bounty.",
          ephemeral: true
        });
      }

      // Modal
      const modal = new ModalBuilder()
        .setCustomId(`claimmodal_${bountyId}`)
        .setTitle("Submit Claim");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("pokemonId")
            .setLabel("Pokémon ID (required)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("screenshot")
            .setLabel("Screenshot URL (optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        )
      );

      return interaction.showModal(modal);
    }
  },
};
// interactions/buttons/bountyButtons.cjs
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

// NOTE: whatever you currently use for rendering the bounty card,
// keep the require the same. If your cardRenderer exports createBountyCard,
// then do:
//   const { createBountyCard } = require("../../renderers/cardRenderer.cjs");
// If it exports a single function, do:
const renderBountyCard = require("../../renderers/cardRenderer.cjs");
// or adjust this line to match your existing working version.

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

      // Move from pending → active
      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      // Render the bounty card image (uses your existing renderer)
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

      if (channel) {
        await channel.send({
          content: bounty.pingText || "", // (optional, if you set this on the bounty)
          files: [{ attachment: buffer, name: "bounty-card.png" }],
          components: [row],
        });
      }

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
    // 3. CLAIM BOUNTY  →  OPEN MODAL
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

      // Prevent multiple claims from same user on same bounty
      const claimKey = `${bountyId}_${userId}`;
      if (!client.bountyClaims) client.bountyClaims = new Map();

      if (client.bountyClaims.has(claimKey)) {
        return interaction.reply({
          content: "⚠ You have already submitted a claim for this bounty.",
          ephemeral: true,
        });
      }

      // Build modal ID: bounty_claim_<bountyId>_<userId>
      const modalCustomId = `bounty_claim_${bountyId}_${userId}`;

      const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle("Bounty Claim");

      const pokemonIdInput = new TextInputBuilder()
        .setCustomId("pokemon_id")
        .setLabel("Pokémon ID")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter the Pokémon ID")
        .setRequired(true);

      const proofInput = new TextInputBuilder()
        .setCustomId("proof_optional")
        .setLabel("Screenshot / Notes (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(pokemonIdInput);
      const row2 = new ActionRowBuilder().addComponents(proofInput);

      modal.addComponents(row1, row2);

      // Show the modal to the user
      await interaction.showModal(modal);
      return;
    }
  },
};
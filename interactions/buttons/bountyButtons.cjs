// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { createBountyCard } = require("../../renderers/cardRenderer.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const {
  getBountyRarityLabel,
  getHighestRarityForList,
} = require("../../utils/rarity.cjs");

module.exports = {
  ids: ["approvebounty_", "denybounty_", "claimbounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // -------------------------------------------------------
    // 🟢 APPROVE BOUNTY
    // -------------------------------------------------------
    if (id.startsWith("approvebounty_")) {
      const bountyId = id.replace("approvebounty_", "");
      console.log("APPROVE BUTTON FIRED:", bountyId);

      const bounty = client.pendingBounties.get(bountyId);
      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty no longer exists.",
          flags: 64,
        });
      }

      // Convert stored timestamps back into Date objects
      bounty.startTime = new Date(bounty.startTime);
      bounty.endTime = new Date(bounty.endTime);

      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      // ANNOUNCEMENT
      const announceId = process.env.BOUNTY_ANNOUNCE_CHANNEL_ID;
      const announceChannel = interaction.guild.channels.cache.get(announceId);

      if (announceChannel) {
        const rarity = getHighestRarityForList(bounty.pokemons);
        const rarityLabel = getBountyRarityLabel(rarity);

        const rolePing =
          process.env[`ROLE_${rarity.toUpperCase()}`] ||
          process.env.ROLE_BOUNTY_ALL ||
          "";

        await announceChannel
          .send({
            content: rolePing ? `<@&${rolePing}>` : "",
            embeds: [
              new EmbedBuilder()
                .setTitle("📢 Bounty Scheduled")
                .setDescription("This bounty will begin soon.")
                .addFields(
                  { name: "Trainer", value: `<@${bounty.requesterId}>` },
                  { name: "Rarity", value: rarityLabel },
                  {
                    name: "Starts",
                    value: `<t:${Math.floor(bounty.startTime / 1000)}:F>`,
                  },
                  {
                    name: "Reward",
                    value: `${bounty.reward.toLocaleString()} PKD`,
                  }
                ),
            ],
          })
          .then((msg) => {
            bounty.announcementId = msg.id;
            console.log("Announcement sent with ID:", msg.id);
          });
      }

      return interaction.reply({ content: "✅ Bounty approved!", flags: 64 });
    }

    // -------------------------------------------------------
    // 🔴 DENY BOUNTY
    // -------------------------------------------------------
    if (id.startsWith("denybounty_")) {
      const bountyId = id.replace("denybounty_", "");
      client.pendingBounties.delete(bountyId);

      return interaction.reply({
        content: "❌ Bounty denied.",
        flags: 64,
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
          flags: 64,
        });
      }

      // Build the correct modal ID your modal handler expects
      const modalCustomId = `bounty_claim_${bountyId}_${interaction.user.id}`;

      const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle("Submit Bounty Claim");

      // Pokémon ID (required)
      const pokemonIdInput = new TextInputBuilder()
        .setCustomId("pokemon_id")
        .setLabel("Pokémon ID (required)")
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      // Screenshot / notes (optional)
      const proofInput = new TextInputBuilder()
        .setCustomId("proof_optional")
        .setLabel("Screenshot link / notes (optional)")
        .setRequired(false)
        .setStyle(TextInputStyle.Paragraph);

      modal.addComponents(
        new ActionRowBuilder().addComponents(pokemonIdInput),
        new ActionRowBuilder().addComponents(proofInput)
      );

      return interaction.showModal(modal);
    }
  },
};
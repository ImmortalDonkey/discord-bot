// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { createBountyCard } = require("../../renderers/cardRenderer.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const {
  getHighestRarityForList,
  getRarityDisplayLabel
} = require("../../utils/rarity.cjs");

module.exports = {
  ids: ["approvebounty_", "denybounty_", "claimbounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // ============================================================
    // 🟢 APPROVE BOUNTY
    // ============================================================
    if (id.startsWith("approvebounty_")) {
      const bountyId = id.replace("approvebounty_", "");
      console.log("APPROVE BUTTON FIRED:", bountyId);

      let bounty = client.pendingBounties.get(bountyId);
      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty no longer exists.",
          flags: 64,
        });
      }

      // Convert back into Date() objects
      bounty.startTime = new Date(bounty.startTime);
      bounty.endTime = new Date(bounty.endTime);

      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      // ==================================================================
      // 📢 SEND ANNOUNCEMENT TO BOUNTY-HUNTING CHANNEL
      // ==================================================================
      const announceId = process.env.BOUNTY_CHANNEL_ID;
      const announceChannel =
        interaction.guild.channels.cache.get(announceId);

      if (announceChannel) {
        const rarity = getHighestRarityForList(bounty.pokemons);
        const rarityLabel = getRarityDisplayLabel(rarity);

        // Correct rarity ping role
        const roleEnvName = `ROLE_${rarity.toUpperCase()}`;
        const rolePing =
          process.env[roleEnvName] ||
          process.env.ROLE_BOUNTY_ALL ||
          "";

        const startUnix = Math.floor(bounty.startTime.getTime() / 1000);

        await announceChannel
          .send({
            content: rolePing ? `<@&${rolePing}>` : "",
            embeds: [
              new EmbedBuilder()
                .setTitle("📢 Bounty Scheduled")
                .setDescription("A new bounty has been approved and is scheduled to begin.")
                .addFields(
                  { name: "Trainer", value: `<@${bounty.requesterId}>`, inline: true },
                  { name: "Rarity", value: rarityLabel, inline: true },
                  {
                    name: "Starts",
                    value: `<t:${startUnix}:F>`,
                    inline: true,
                  },
                  {
                    name: "Reward",
                    value: `${Number(bounty.reward).toLocaleString()} PKD`,
                    inline: false,
                  }
                )
            ]
          })
          .then((msg) => {
            bounty.announcementId = msg.id;
          });
      }

      await interaction.reply({
        content: "✅ Bounty approved!",
        flags: 64,
      });

      return;
    }

    // ============================================================
    // 🔴 DENY BOUNTY
    // ============================================================
    if (id.startsWith("denybounty_")) {
      const bountyId = id.replace("denybounty_", "");

      client.pendingBounties.delete(bountyId);

      return interaction.reply({
        content: "❌ Bounty denied and removed.",
        flags: 64,
      });
    }

    // ============================================================
    // 🟡 CLAIM BOUNTY
    // ============================================================
    if (id.startsWith("claimbounty_")) {
      const bountyId = id.replace("claimbounty_", "");
      const bounty = client.activeBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty is no longer active.",
          flags: 64,
        });
      }

      // OPEN CLAIM FORM MODAL
      return interaction.showModal({
        customId: `bounty_claim_${bountyId}_${interaction.user.id}`,
        title: "Submit Bounty Claim",
        components: [
          // Required Pokémon ID field
          {
            type: 1,
            components: [
              {
                type: 4,
                customId: "pokemon_id",
                label: "Pokémon ID (required)",
                style: 1,
                required: true,
              },
            ],
          },
          // Optional screenshot/proof
          {
            type: 1,
            components: [
              {
                type: 4,
                customId: "proof_optional",
                label: "Screenshot Link / Notes (optional)",
                style: 2,
                required: false,
              },
            ],
          },
        ],
      });
    }
  },
};
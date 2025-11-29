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

      // Convert timestamp strings → Date()
      bounty.startTime = new Date(bounty.startTime);
      bounty.endTime = new Date(bounty.endTime);

      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
      const bountyChannel = interaction.guild.channels.cache.get(bountyChannelId);

      if (!bountyChannel) {
        return interaction.reply({
          content: "❌ Missing BOUNTY_CHANNEL_ID.",
          flags: 64,
        });
      }

      const rarity = getHighestRarityForList(bounty.pokemons);
      const rarityLabel = getRarityDisplayLabel(rarity);

      const roleEnvName = `ROLE_${rarity.toUpperCase()}`;
      const rolePing =
        process.env[roleEnvName] ||
        process.env.ROLE_BOUNTY_ALL ||
        "";

      // ================================
      // CASE 1: STARTS NOW → post card immediately
      // ================================
      if (bounty.startsNow) {
        const buffer = await createBountyCard(
          bounty,
          interaction.guild.members.cache.get(bounty.requesterId)
        );

        await bountyChannel.send({
          content: rolePing ? `<@&${rolePing}>` : "",
          files: [{ attachment: buffer, name: "bounty-card.png" }],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`claimbounty_${bountyId}`)
                .setLabel("Claim Bounty")
                .setStyle(ButtonStyle.Success)
            ),
          ],
        });

        return interaction.reply({
          content: "✅ Bounty approved & posted!",
          flags: 64,
        });
      }

      // ================================
      // CASE 2: SCHEDULED → announcement now, card later
      // ================================
      const startUnix = Math.floor(bounty.startTime.getTime() / 1000);

      const announceMsg = await bountyChannel.send({
        content: rolePing ? `<@&${rolePing}>` : "",
        embeds: [
          new EmbedBuilder()
            .setTitle("📢 Bounty Scheduled")
            .setDescription("A new bounty has been approved and will start soon.")
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
      });

      bounty.announcementId = announceMsg.id;

      // Schedule activation
      const delay = bounty.startTime.getTime() - Date.now();
      setTimeout(async () => {
        try {
          const member = interaction.guild.members.cache.get(bounty.requesterId);
          const buffer = await createBountyCard(bounty, member);

          await announceMsg.delete().catch(() => {});

          await bountyChannel.send({
            content: rolePing ? `<@&${rolePing}>` : "",
            files: [{ attachment: buffer, name: "bounty-card.png" }],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`claimbounty_${bountyId}`)
                  .setLabel("Claim Bounty")
                  .setStyle(ButtonStyle.Success)
              ),
            ],
          });
        } catch (err) {
          console.error("Bounty activation failed:", err);
        }
      }, delay);

      return interaction.reply({
        content: "⏳ Bounty approved & scheduled!",
        flags: 64,
      });
    }

    // ============================================================
    // 🔴 DENY BOUNTY
    // ============================================================
    if (id.startsWith("denybounty_")) {
      const bountyId = id.replace("denybounty_", "");

      client.pendingBounties.delete(bountyId);

      return interaction.reply({
        content: "❌ Bounty denied.",
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

      // Open modal (correct format)
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
                label: "Pokémon ID",
                style: 1,
                required: true,
              },
            ],
          },
          {
            type: 1,
            components: [
              {
                type: 4,
                customId: "proof_optional",
                label: "Screenshot / Notes (optional)",
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
// interactions/buttons/bountyButtons.cjs

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

module.exports = {
  // This file handles ALL bounty button clicks
  idPrefix: "approvebounty_", // also dynamically handles deny
  async execute(client, interaction) {
    try {
      const customId = interaction.customId;

      // APPROVE BUTTON ──────────────────────────────────────────────
      if (customId.startsWith("approvebounty_")) {
        const bountyId = customId.replace("approvebounty_", "");
        const bounty = client.pendingBounties.get(bountyId);

        if (!bounty) {
          return interaction.reply({
            content: "❌ This bounty no longer exists.",
            ephemeral: true
          });
        }

        const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
        const bountyChannel = await interaction.guild.channels
          .fetch(bountyChannelId)
          .catch(() => null);

        if (!bountyChannel) {
          return interaction.reply({
            content: "❌ Cannot find the bounty channel.",
            ephemeral: true
          });
        }

        // Move bounty to ACTIVE
        client.pendingBounties.delete(bountyId);
        client.activeBounties.set(bountyId, bounty);

        const startUnix = Math.floor(bounty.startTime.getTime() / 1000);
        const endUnix = Math.floor(bounty.endTime.getTime() / 1000);

        const embed = new EmbedBuilder()
          .setTitle("🎯 Active Bounty")
          .setDescription(
            `A bounty has been approved and is now **live**!\n\n` +
            `🧑‍🎓 **Requester:** <@${bounty.requesterId}>\n` +
            `💰 **Reward:** ${bounty.reward.toLocaleString()} PKD`
          )
          .addFields(
            {
              name: "🎯 Targets",
              value: bounty.pokemons.map(p => `• ${p}`).join("\n"),
              inline: false
            },
            {
              name: "🕒 Starts",
              value: `<t:${startUnix}:F>`,
              inline: true
            },
            {
              name: "⏳ Ends",
              value: `<t:${endUnix}:F>`,
              inline: true
            },
            {
              name: "📝 Notes",
              value: bounty.notes,
              inline: false
            }
          )
          .setTimestamp()
          .setColor("Green");

        const claimButton = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`claimbounty_${bountyId}`)
            .setLabel("Claim Bounty")
            .setStyle(ButtonStyle.Primary)
        );

        // Post to live bounty channel
        await bountyChannel.send({
          embeds: [embed],
          components: [claimButton]
        });

        // Confirm to moderator
        return interaction.reply({
          content: "✅ Bounty approved and posted in the bounty channel.",
          ephemeral: true
        });
      }

      // DENY BUTTON ────────────────────────────────────────────────
      if (customId.startsWith("denybounty_")) {
        const bountyId = customId.replace("denybounty_", "");
        const bounty = client.pendingBounties.get(bountyId);

        if (!bounty) {
          return interaction.reply({
            content: "❌ This bounty no longer exists.",
            ephemeral: true
          });
        }

        client.pendingBounties.delete(bountyId);

        // Notify requester privately (if possible)
        try {
          const user = await interaction.client.users.fetch(
            bounty.requesterId
          );
          await user.send(
            `❌ Your bounty request for **${bounty.pokemons.join(
              ", "
            )}** was denied by staff.`
          );
        } catch (e) {
          console.log("DM failed for denied bounty:", e);
        }

        return interaction.reply({
          content: "🚫 Bounty request denied.",
          ephemeral: true
        });
      }
    } catch (err) {
      console.error("❌ Error in bountyButtons:", err);
      return interaction.reply({
        content:
          "❌ An error occurred while handling that bounty action.",
        ephemeral: true
      });
    }
  }
};

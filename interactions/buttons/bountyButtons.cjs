// interactions/buttons/bountyButtons.cjs

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

module.exports = {
  idPrefix: ["approvebounty_", "denybounty_"],  // <── FIX: multiple prefixes supported

  async execute(client, interaction) {
    const id = interaction.customId;

    // ────────────────────────────────
    // APPROVE
    // ────────────────────────────────
    if (id.startsWith("approvebounty_")) {
      const bountyId = id.replace("approvebounty_", "");
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty no longer exists.",
          ephemeral: true
        });
      }

      const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
      const channel = await interaction.guild.channels
        .fetch(bountyChannelId)
        .catch(() => null);

      if (!channel) {
        return interaction.reply({
          content: "❌ Cannot find the configured bounty channel.",
          ephemeral: true
        });
      }

      client.pendingBounties.delete(bountyId);
      client.activeBounties.set(bountyId, bounty);

      const startUnix = Math.floor(bounty.startTime.getTime() / 1000);
      const endUnix = Math.floor(bounty.endTime.getTime() / 1000);

      const embed = new EmbedBuilder()
        .setTitle("🎯 Active Bounty")
        .setColor("Green")
        .setDescription("A bounty has been approved and is now live!")
        .addFields(
          {
            name: "Requester",
            value: `<@${bounty.requesterId}>`,
            inline: true
          },
          {
            name: "Reward",
            value: `${bounty.reward.toLocaleString()} PKD`,
            inline: true
          },
          {
            name: "Targets",
            value: bounty.pokemons.map(p => `• ${p}`).join("\n"),
            inline: false
          },
          {
            name: "Start",
            value: `<t:${startUnix}:F>`,
            inline: true
          },
          {
            name: "End",
            value: `<t:${endUnix}:F>`,
            inline: true
          },
          {
            name: "Notes",
            value: bounty.notes,
            inline: false
          }
        )
        .setTimestamp();

      const claimButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claimbounty_${bountyId}`)
          .setLabel("Claim Bounty")
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({
        embeds: [embed],
        components: [claimButton]
      });

      return interaction.reply({
        content: "✅ Bounty approved and posted.",
        ephemeral: true
      });
    }

    // ────────────────────────────────
    // DENY
    // ────────────────────────────────
    if (id.startsWith("denybounty_")) {
      const bountyId = id.replace("denybounty_", "");
      const bounty = client.pendingBounties.get(bountyId);

      if (!bounty) {
        return interaction.reply({
          content: "❌ This bounty no longer exists.",
          ephemeral: true
        });
      }

      client.pendingBounties.delete(bountyId);

      // DM requester
      try {
        const u = await client.users.fetch(bounty.requesterId);
        await u.send(
          `❌ Your bounty request for **${bounty.pokemons.join(
            ", "
          )}** was denied by staff.`
        );
      } catch {}

      return interaction.reply({
        content: "🚫 Bounty denied.",
        ephemeral: true
      });
    }
  }
};

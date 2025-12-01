// interactions/buttons/bountyButtons.cjs
const {
  EmbedBuilder
} = require("discord.js");

const db = require("../../database.cjs");
const { postBountyCard } = require("../../utils/bountyScheduler.cjs");

module.exports = {
  ids: ["approvebounty_", "denybounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // SAFETY: defer to avoid "Unknown interaction"
    await interaction.deferReply({ flags: 64 }); // ephemeral reply

    // ============================================================
    // 🟢 APPROVE BOUNTY
    // ============================================================
    if (id.startsWith("approvebounty_")) {
      const bountyId = id.replace("approvebounty_", "");

      const bounty = await db.getBountyById(bountyId);
      if (!bounty || bounty.status !== "pending") {
        return interaction.editReply({
          content: "❌ This bounty is no longer pending."
        });
      }

      // Update status → open
      await db.updateBounty(bountyId, {
        status: "open",
        approvedAt: Date.now()
      });

      const guild = interaction.guild;
      const requestThread = guild.channels.cache.get(bounty.requestThreadId);

      if (requestThread) {
        try {
          await requestThread.send(`✔ **Approved by <@${interaction.user.id}>**`);
        } catch {}
      }

      const now = Date.now();
      const startsNow = !!bounty.startsImmediately;

      // ============================================================
      // STARTS IMMEDIATELY → SEND CARD NOW
      // ============================================================
      if (startsNow || now >= bounty.startTime) {
        const msg = await postBountyCard(client, bounty);

        if (msg) {
          await db.updateBounty(bountyId, {
            cardChannelId: msg.channel.id,
            cardMessageId: msg.id
          });
        }

        return interaction.editReply({
          content: "📢 **Bounty Approved!** It has started immediately."
        });
      }

      // ============================================================
      // FUTURE START → SEND SCHEDULED ANNOUNCEMENT
      // ============================================================
      const announceChannelId = process.env.BOUNTY_CHANNEL_ID;
      const announceChannel = guild.channels.cache.get(announceChannelId);

      if (!announceChannel) {
        return interaction.editReply({
          content: "❌ BOUNTY_CHANNEL_ID is not configured correctly."
        });
      }

      const startUnix = Math.floor(bounty.startTime / 1000);
      const endUnix = Math.floor(bounty.endTime / 1000);

      const pokemonList = (bounty.pokemons || [])
        .map(p => `• ${p}`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle("⏳ Scheduled Bounty Approved")
        .setDescription("This bounty will automatically start at the scheduled time.")
        .addFields(
          { name: "Trainer", value: `<@${bounty.requesterId}>`, inline: true },
          { name: "Reward", value: `${Number(bounty.reward).toLocaleString()} PKD`, inline: true },
          { name: "Pokémon", value: pokemonList || "None", inline: false },
          { name: "Starts", value: `<t:${startUnix}:F>`, inline: true },
          { name: "Ends", value: `<t:${endUnix}:F>`, inline: true }
        )
        .setColor("Yellow");

      const announcement = await announceChannel.send({ embeds: [embed] });

      await db.updateBounty(bountyId, {
        announcementChannelId: announceChannel.id,
        announcementMessageId: announcement.id
      });

      return interaction.editReply({
        content: "⏱️ **Bounty Approved!** It will start at the scheduled time."
      });
    }

    // ============================================================
    // 🔴 DENY BOUNTY
    // ============================================================
    if (id.startsWith("denybounty_")) {
      const bountyId = id.replace("denybounty_", "");

      const bounty = await db.getBountyById(bountyId);
      if (!bounty || bounty.status !== "pending") {
        return interaction.editReply({
          content: "❌ This bounty is no longer pending."
        });
      }

      await db.updateBounty(bountyId, {
        status: "rejected"
      });

      const guild = interaction.guild;
      const requestThread = guild.channels.cache.get(bounty.requestThreadId);

      if (requestThread) {
        try {
          await requestThread.send(`❌ **Denied by <@${interaction.user.id}>**`);
        } catch {}
      }

      return interaction.editReply({
        content: "❌ Bounty has been denied."
      });
    }
  }
};

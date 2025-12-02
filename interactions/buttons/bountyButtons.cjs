// interactions/buttons/bountyButtons.cjs
const { EmbedBuilder } = require("discord.js");
const db = require("../../database.cjs");
const { postBountyCard } = require("../../utils/bountyScheduler.cjs");

module.exports = {
  ids: ["approvebounty_", "denybounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // Prevent "Unknown interaction"
    await interaction.deferReply({ flags: 64 });

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

      // Mark bounty as approved + keep timestamps
      await db.updateBounty(bountyId, {
        status: "open",
        approvedAt: Date.now()
      });

      // Message in request thread
      const guild = interaction.guild;
      const requestThread = guild.channels.cache.get(bounty.requestThreadId);

      if (requestThread) {
        try {
          await requestThread.send(`✔ **Approved by <@${interaction.user.id}>**`);
        } catch {}

        // ---------------------------------------------------------
        // 🆕 AUTO-DELETE BOUNTY REQUEST THREAD AFTER 1 MINUTE
        // ---------------------------------------------------------
        setTimeout(async () => {
          try {
            await requestThread.delete();
          } catch {
            console.warn("⚠ Could not delete bounty request thread.");
          }
        }, 60000);
      }

      const now = Date.now();
      const startsImmediately = !!bounty.startsImmediately;

      // ============================================================
      // START NOW → post card immediately (NO ANNOUNCEMENT EMBED)
      // ============================================================
      if (startsImmediately || now >= bounty.startTime) {
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
      // SCHEDULED START → post announcement embed
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

      const announcement = await announceChannel.send({
        embeds: [embed]
      });

      // Save the announcement for scheduler to delete later
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

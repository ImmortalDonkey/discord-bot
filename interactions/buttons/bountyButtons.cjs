// interactions/buttons/bountyButtons.cjs
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const db = require("../../database.cjs");
const { postBountyCard } = require("../../utils/bountyScheduler.cjs");

module.exports = {
  ids: ["approvebounty_", "denybounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // ============================================================
    // 🟢 APPROVE BOUNTY
    // ============================================================
    if (id.startsWith("approvebounty_")) {
      const bountyId = id.replace("approvebounty_", "");

      // Load from DB
      const bounty = await db.getBountyById(bountyId);
      if (!bounty || bounty.status !== "pending") {
        return interaction.reply({
          content: "❌ This bounty is no longer pending.",
          ephemeral: true
        });
      }

      // Update status → open
      await db.updateBounty(bountyId, {
        status: "open",
        approved_at: Date.now()
      });

      const guild = interaction.guild;
      const requestThread = guild.channels.cache.get(bounty.request_thread_id);

      if (requestThread) {
        try {
          await requestThread.send(`✔ **Approved by <@${interaction.user.id}>**`);
        } catch {}
      }

      const now = Date.now();
      const startsNow = bounty.starts_immediately === 1;

      // ============================================================
      // STARTS IMMEDIATELY → SEND CARD NOW
      // ============================================================
      if (startsNow || now >= bounty.start_time) {
        const msg = await postBountyCard(client, bounty);

        if (msg) {
          await db.updateBounty(bountyId, {
            card_channel_id: msg.channel.id,
            card_message_id: msg.id
          });
        }

        return interaction.reply({
          content: "📢 **Bounty Approved!** It has started immediately.",
          ephemeral: true
        });
      }

      // ============================================================
      // FUTURE START → SEND SCHEDULED ANNOUNCEMENT
      // ============================================================
      const announceChannelId = process.env.BOUNTY_CHANNEL_ID;
      const announceChannel = guild.channels.cache.get(announceChannelId);

      if (!announceChannel) {
        return interaction.reply({
          content: "❌ BOUNTY_CHANNEL_ID is not configured correctly.",
          ephemeral: true
        });
      }

      const startUnix = Math.floor(bounty.start_time / 1000);
      const endUnix = Math.floor(bounty.end_time / 1000);

      const pokemonList = JSON.parse(bounty.pokemons || "[]")
        .map(p => `• ${p}`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle("⏳ Scheduled Bounty Approved")
        .setDescription("This bounty will automatically start at the scheduled time.")
        .addFields(
          { name: "Trainer", value: `<@${bounty.requester_id}>`, inline: true },
          { name: "Reward", value: `${bounty.reward.toLocaleString()} PKD`, inline: true },
          { name: "Pokémon", value: pokemonList, inline: false },
          { name: "Starts", value: `<t:${startUnix}:F>`, inline: true },
          { name: "Ends", value: `<t:${endUnix}:F>`, inline: true }
        )
        .setColor("Yellow");

      const announcement = await announceChannel.send({ embeds: [embed] });

      await db.updateBounty(bountyId, {
        announcement_channel_id: announceChannel.id,
        announcement_message_id: announcement.id
      });

      return interaction.reply({
        content: "⏱️ **Bounty Approved!** It will start at the scheduled time.",
        ephemeral: true
      });
    }

    // ============================================================
    // 🔴 DENY BOUNTY
    // ============================================================
    if (id.startsWith("denybounty_")) {
      const bountyId = id.replace("denybounty_", "");

      const bounty = await db.getBountyById(bountyId);
      if (!bounty || bounty.status !== "pending") {
        return interaction.reply({
          content: "❌ This bounty is no longer pending.",
          ephemeral: true
        });
      }

      await db.updateBounty(bountyId, {
        status: "rejected"
      });

      const guild = interaction.guild;
      const requestThread = guild.channels.cache.get(bounty.request_thread_id);

      if (requestThread) {
        try {
          await requestThread.send(`❌ **Denied by <@${interaction.user.id}>**`);
        } catch {}
      }

      return interaction.reply({
        content: "❌ Bounty has been denied.",
        ephemeral: true
      });
    }
  }
};
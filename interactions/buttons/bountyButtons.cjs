// interactions/buttons/bountyButtons.cjs
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const db = require("../../database.cjs");
const { postBountyCard } = require("../../utils/bountyScheduler.cjs");
const { createBountyCard } = require("../../renderers/cardRenderer.cjs");

module.exports = {
  ids: ["approvebounty_", "denybounty_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    // =======================================================================
    // 🟢 APPROVE BOUNTY
    // =======================================================================
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

      // Mark approved
      await db.updateBounty(bountyId, {
        status: "open",
        approved_at: Date.now()
      });

      const guild = interaction.guild;
      const channelId = bounty.request_thread_id;
      const requestThread = guild.channels.cache.get(channelId);

      if (requestThread) {
        try {
          await requestThread.send(`✔ **Approved by <@${interaction.user.id}>**`);
        } catch {}
      }

      // START TIME LOGIC
      const now = Date.now();
      const startsNow = bounty.starts_immediately === 1;

      // If it starts immediately → render card right now
      if (startsNow || now >= bounty.start_time) {
        // Fully render the card + send to bounty channel
        const msg = await postBountyCard(client, bountyId);

        if (msg) {
          await db.updateBounty(bountyId, {
            card_channel_id: msg.channel.id,
            card_message_id: msg.id
          });
        }

        return interaction.reply({
          content: "📢 **Bounty Approved!** The bounty has started immediately.",
          ephemeral: true
        });
      }

      // FUTURE START → Post a scheduled announcement
      const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
      const bountyChannel = guild.channels.cache.get(bountyChannelId);

      if (!bountyChannel) {
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
        .setDescription("This bounty will begin automatically when the start time arrives.")
        .addFields(
          { name: "Trainer", value: `<@${bounty.requester_id}>`, inline: true },
          { name: "Reward", value: `${bounty.reward.toLocaleString()} PKD`, inline: true },
          { name: "Pokémon", value: pokemonList, inline: false },
          { name: "Starts", value: `<t:${startUnix}:F>`, inline: true },
          { name: "Ends", value: `<t:${endUnix}:F>`, inline: true }
        )
        .setColor("Yellow");

      const announcement = await bountyChannel.send({ embeds: [embed] });

      await db.updateBounty(bountyId, {
        announcement_channel_id: bountyChannel.id,
        announcement_message_id: announcement.id
      });

      return interaction.reply({
        content: "⏱️ **Bounty Approved!** It will begin at the scheduled start time.",
        ephemeral: true
      });
    }

    // =======================================================================
    // 🔴 DENY BOUNTY
    // =======================================================================
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
      const channelId = bounty.request_thread_id;
      const requestThread = guild.channels.cache.get(channelId);

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
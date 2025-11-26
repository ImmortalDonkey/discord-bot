// interactions/commands/activebounties.cjs
const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "activebounties",

  async execute(client, interaction) {
    const active = client.activeBounties;

    if (!active || active.size === 0) {
      return interaction.reply({
        content: "📭 There are currently **no active bounties**.",
        ephemeral: true
      });
    }

    const now = Date.now();
    const lines = [];

    for (const [threadId, bounty] of active.entries()) {
      const {
        ownerId,
        ownedBy,
        pokemonList,
        reward,
        notes,
        startTimestamp,
        endTimestamp
      } = bounty;

      const start = new Date(startTimestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const end = new Date(endTimestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const remainingMs = endTimestamp - now;
      const remainingMin = Math.max(1, Math.floor(remainingMs / 60000));

      lines.push(
        `🧵 **Thread:** <#${threadId}>\n` +
        `👤 **Owner:** <@${ownerId}> (${ownedBy})\n` +
        `🎯 **Targets:** ${pokemonList.join(", ")}\n` +
        `💰 **Reward:** ${reward.toLocaleString()} pkd\n` +
        `📝 **Notes:** ${notes}\n` +
        `⏳ **Time:** ${start} → ${end} (**${remainingMin} minutes left**)\n`
      );
    }

    const embed = new EmbedBuilder()
      .setColor("Gold")
      .setTitle("🔥 Active Bounties")
      .setDescription(lines.join("\n"))
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};

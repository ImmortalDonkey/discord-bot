// interactions/commands/leaderboard.cjs
const { EmbedBuilder } = require('discord.js');
const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
  name: 'leaderboard',

  async execute(client, interaction) {
    const rows = await db.getLeaderboard(10);

    if (!rows || rows.length === 0) {
      return interaction.reply({
        content: "📭 No leaderboard data yet.",
        ephemeral: true
      });
    }

    const medals = ["🥇", "🥈", "🥉"];

    const lines = rows.map((u, index) => {
      const lifetime = u.lifetime_points ?? 0;
      const current = u.points ?? 0;
      const rankName = getRankName(lifetime);
      const medal = medals[index] || `#${index + 1}`;

      const username = u.username || "(unknown)";

      return `${medal} **${username}** — *${rankName}* — **${lifetime}** lifetime pts (Current: ${current})`;
    });

    const embed = new EmbedBuilder()
      .setColor("Gold")
      .setTitle("🏆 Top Hunters — Lifetime Points")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "Lifetime points = historic total; Current points = spendable." })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};

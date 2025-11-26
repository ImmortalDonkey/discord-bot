// interactions/commands/leaderboard.cjs
const { EmbedBuilder } = require('discord.js');
const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
  name: 'leaderboard',

  async execute(client, interaction) {
    const rows = await db.getLeaderboard(10);
    if (rows.length === 0) {
      return interaction.reply({ content: 'No data yet.', ephemeral: true });
    }

    const desc = rows.map((u, i) => {
      const lifetime = u.lifetime_points || 0;
      const current = u.points || 0;
      const rankName = getRankName(lifetime);
      return `**#${i + 1}** — ${u.username} — *${rankName}* — ${lifetime} lifetime pts (Current: ${current})`;
    }).join('\n');

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('Gold')
          .setTitle('🏆 Top Hunters (Lifetime)')
          .setDescription(desc)
      ]
    });
  }
};


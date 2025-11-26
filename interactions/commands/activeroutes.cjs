// interactions/commands/activeroutes.cjs
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activeroutes')
    .setDescription('View all routes with active sightings'),

  async execute(client, interaction) {
    const pendingReports = client.pendingReports;

    if (!pendingReports || pendingReports.size === 0) {
      return interaction.reply({
        content: "📭 There are **no active sightings** this hour.",
        ephemeral: true,
      });
    }

    const grouped = new Map();

    for (const [userId, data] of pendingReports.entries()) {
      const { pokemon, route, createdAt } = data;
      if (!pokemon || !route) continue;

      if (!grouped.has(route)) grouped.set(route, []);

      grouped.get(route).push({
        userId,
        pokemon,
        createdAt
      });
    }

    if (grouped.size === 0) {
      return interaction.reply({
        content: "📭 There are **no active sightings** this hour.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setTitle('🗺 Active Sightings by Route')
      .setDescription('All sightings reported during the **current hour**.')
      .setTimestamp();

    for (const [route, reports] of grouped.entries()) {
      const lines = reports.map(r => {
        const time = new Date(r.createdAt)
          .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return `• **${r.pokemon}** (reported by <@${r.userId}> at **${time}**)`;
      });

      embed.addFields({
        name: `📍 ${route}`,
        value: lines.join('\n'),
        inline: false
      });
    }

    return interaction.reply({ embeds: [embed] });
  }
};

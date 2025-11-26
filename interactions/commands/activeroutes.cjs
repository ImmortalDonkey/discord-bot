// interactions/commands/activeroutes.cjs
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'activeroutes',

  async execute(client, interaction) {
    const pendingReports = client.pendingReports;

    if (!pendingReports || pendingReports.size === 0) {
      return interaction.reply({
        content: "📭 There are **no active sightings** this hour.",
        ephemeral: true,
      });
    }

    // Group by route
    const grouped = new Map(); // route → array of sightings

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

    // Build embed
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


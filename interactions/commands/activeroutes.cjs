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

    const now = new Date();
    const thisHour = now.getHours();

    // Group sightings by route
    const grouped = new Map(); // route → array of sightings

    for (const [userId, data] of pendingReports.entries()) {
      const { pokemon, route, createdAt } = data;
      if (!pokemon || !route) continue;

      const reportDate = new Date(createdAt);
      if (reportDate.getHours() !== thisHour) continue; // must match the current hour

      if (!grouped.has(route)) grouped.set(route, []);

      grouped.get(route).push({
        userId,
        pokemon,
        createdAt: reportDate
      });
    }

    // If nothing for this hour
    if (grouped.size === 0) {
      return interaction.reply({
        content: "📭 There are **no active sightings** this hour.",
        ephemeral: true,
      });
    }

    // Prepare embed
    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setTitle('🗺 Active Sightings by Route')
      .setDescription('Sightings reported during the **current hour**.')
      .setTimestamp();

    // Sort routes alphabetically
    const sortedRoutes = [...grouped.keys()].sort((a, b) => a.localeCompare(b));

    for (const route of sortedRoutes) {
      const reports = grouped.get(route);

      // Sort sightings by time (oldest first)
      reports.sort((a, b) => a.createdAt - b.createdAt);

      const lines = reports.map(r => {
        const time = r.createdAt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });

        return `• **${r.pokemon}** — <@${r.userId}> (at **${time}**)`;
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

// interactions/commands/mypoints.cjs

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
  // 🚫 MAIN GUILD ONLY
  // Internal convenience command – NOT subscriber safe
  mainGuildOnly: true,

  data: new SlashCommandBuilder()
    .setName('mypoints')
    .setDescription('View your current points, lifetime points, and rank'),

  async execute(client, interaction) {
    const user = interaction.user;
    const row = await db.getUserById(user.id);

    const currentPoints = row?.points || 0;
    const lifetimePoints = row?.lifetime_points || 0;
    const rankName = getRankName(lifetimePoints);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('Gold')
          .setTitle('⭐ Your Points & Rank')
          .addFields(
            { name: 'Rank', value: rankName, inline: true },
            { name: 'Lifetime Points', value: String(lifetimePoints), inline: true },
            { name: 'Current Points', value: String(currentPoints), inline: true }
          )
          .setTimestamp()
      ],
      ephemeral: true
    });
  }
};

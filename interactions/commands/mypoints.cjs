// interactions/commands/mypoints.cjs
const { EmbedBuilder } = require('discord.js');
const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
  name: 'mypoints',

  async execute(client, interaction) {
    const user = interaction.user;
    const row = await db.getUserById(user.id);

    const pts = row?.points || 0;               // current spendable points
    const lifetime = row?.lifetime_points || 0; // historic
    const rankName = getRankName(lifetime);
    const value = pts * 200000;

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('Gold')
          .setTitle('💰 Your Points & Rank')
          .addFields(
            { name: 'Rank', value: rankName, inline: true },
            { name: 'Lifetime Points', value: String(lifetime), inline: true },
            { name: 'Current Points', value: String(pts), inline: true },
            { name: 'PKD Value (Current)', value: value.toLocaleString() + ' pkd', inline: false }
          )
      ],
      ephemeral: true
    });
  }
};


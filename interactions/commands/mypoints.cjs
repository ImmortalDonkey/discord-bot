// interactions/commands/mypoints.cjs
const { EmbedBuilder } = require('discord.js');
const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
  name: 'mypoints',

  async execute(client, interaction) {
    const user = interaction.user;

    // Fetch user row safely
    const row = await db.getUserById(user.id);

    const currentPoints = row?.points ?? 0;           // spendable
    const lifetimePoints = row?.lifetime_points ?? 0; // total earned over time
    const rankName = getRankName(lifetimePoints);

    const pkdValue = currentPoints * 200000;

    const embed = new EmbedBuilder()
      .setColor('Gold')
      .setTitle('💰 Your Points & Rank')
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🏅 Rank', value: rankName, inline: true },
        { name: '📈 Lifetime Points', value: String(lifetimePoints), inline: true },
        { name: '💳 Current Points', value: String(currentPoints), inline: true },
      );

    // Only show PKD conversion if they actually have points
    if (currentPoints > 0) {
      embed.addFields({
        name: '💵 PKD Value',
        value: `${pkdValue.toLocaleString()} pkd`,
        inline: false
      });
    }

    embed.setFooter({ text: 'Use /claim to convert your points into PKD.' });
    embed.setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};

const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
  // 🚫 MAIN GUILD ONLY
  // Staff/admin command – NEVER global
  mainGuildOnly: true,

  data: new SlashCommandBuilder()
    .setName('editpoints')
    .setDescription('STAFF: View or edit a player’s points.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Player to modify')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('action')
        .setDescription('What do you want to modify?')
        .setRequired(true)
        .addChoices(
          { name: 'View', value: 'view' },
          { name: 'Add Current', value: 'add_current' },
          { name: 'Remove Current', value: 'remove_current' },
          { name: 'Set Current', value: 'set_current' },
          { name: 'Add Lifetime', value: 'add_lifetime' },
          { name: 'Remove Lifetime', value: 'remove_lifetime' },
          { name: 'Add Both', value: 'add_both' },
          { name: 'Remove Both', value: 'remove_both' },
          { name: 'Reset Both to Zero', value: 'reset_both' }
        )
    )
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount of points to change (ignored for View)')
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for this change')
    ),

  async execute(client, interaction) {
    const user = interaction.options.getUser('user');
    const action = interaction.options.getString('action');
    const amount = interaction.options.getInteger('amount') || 0;
    const reason = interaction.options.getString('reason') || 'Manual adjustment';

    // -------- STAFF CHECK --------
    const allowedRoles = (process.env.STAFF_ROLES || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);

    const isStaff = interaction.member.roles.cache.some(r =>
      allowedRoles.includes(r.id)
    );

    if (!isStaff) {
      return interaction.reply({
        content: '❌ You are not authorized to use this command.',
        flags: 64
      });
    }

    const row = await db.getUserById(user.id);

    const currentPoints = row?.points || 0;
    const currentLifetime = row?.lifetime_points || 0;

    // -------- VIEW ONLY --------
    if (action === 'view') {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Blue')
            .setTitle(`📊 Points for ${user.username}`)
            .addFields(
              { name: 'Rank', value: getRankName(currentLifetime), inline: true },
              { name: 'Current Points', value: `${currentPoints}`, inline: true },
              { name: 'Lifetime Points', value: `${currentLifetime}`, inline: true }
            )
            .setTimestamp()
        ],
        flags: 64
      });
    }

    if (
      [
        'add_current',
        'remove_current',
        'set_current',
        'add_lifetime',
        'remove_lifetime',
        'add_both',
        'remove_both'
      ].includes(action) &&
      amount <= 0
    ) {
      return interaction.reply({
        content: '❌ Amount must be greater than 0.',
        flags: 64
      });
    }

    // -------- MODIFY VALUES --------
    let newCurrent = currentPoints;
    let newLifetime = currentLifetime;

    switch (action) {
      case 'add_current':
        newCurrent += amount;
        break;
      case 'remove_current':
        newCurrent = Math.max(0, currentPoints - amount);
        break;
      case 'set_current':
        newCurrent = Math.max(0, amount);
        break;
      case 'add_lifetime':
        newLifetime += amount;
        break;
      case 'remove_lifetime':
        newLifetime = Math.max(0, currentLifetime - amount);
        break;
      case 'add_both':
        newCurrent += amount;
        newLifetime += amount;
        break;
      case 'remove_both':
        newCurrent = Math.max(0, currentPoints - amount);
        newLifetime = Math.max(0, currentLifetime - amount);
        break;
      case 'reset_both':
        newCurrent = 0;
        newLifetime = 0;
        break;
    }

    // Save new values
    await db.updateUserPoints(user.id, newCurrent);
    await db.updateLifetimePoints(user.id, newLifetime);

    // Update rank
    const rank = getRankName(newLifetime);
    await db.run(
      `UPDATE points SET rank_name = ? WHERE discord_id = ?`,
      [rank, user.id]
    );

    const updated = await db.getUserById(user.id);

    const embed = new EmbedBuilder()
      .setColor('Gold')
      .setTitle(`🛠 Updated Points for ${user.username}`)
      .addFields(
        { name: 'Action', value: action, inline: true },
        { name: 'Current Points', value: `${updated.points}`, inline: true },
        { name: 'Lifetime Points', value: `${updated.lifetime_points}`, inline: true },
        { name: 'Rank', value: updated.rank_name || rank, inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      flags: 64
    });
  }
};

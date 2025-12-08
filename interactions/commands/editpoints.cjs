const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const db = require('../../database.cjs');
const { updateRank, getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
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
          { name: 'Remove Both', value: 'remove_both' }
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

    // STAFF CHECK (authoritative)
    const allowedRoles = (process.env.STAFF_ROLES || '')
      .split(',').map(r => r.trim());
    const isStaff = interaction.member.roles.cache.some(r =>
      allowedRoles.includes(r.id)
    );

    if (!isStaff) {
      return interaction.reply({
        content: '❌ You are not authorized to use this command.',
        flags: 64
      });
    }

    const record = await db.getUserById(user.id);
    const currentPoints = record?.points || 0;
    const currentLifetime = record?.lifetime_points || 0;

    // VIEW
    if (action === 'view') {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Blue')
            .setTitle(`📊 Points for ${user.username}`)
            .addFields(
              { name: 'Current Points', value: `${currentPoints}`, inline: true },
              { name: 'Lifetime Points', value: `${currentLifetime}`, inline: true },
              { name: 'Rank', value: getRankName(currentLifetime), inline: true }
            )
            .setTimestamp()
        ],
        flags: 64
      });
    }

    if (amount <= 0) {
      return interaction.reply({
        content: '❌ Amount must be greater than 0.',
        flags: 64
      });
    }

    let newCurrent = currentPoints;
    let newLifetime = currentLifetime;
    let lifetimeChanged = false;

    switch (action) {
      case 'add_current':
        newCurrent = currentPoints + amount;
        await db.updateUserPoints(user.id, newCurrent);
        break;

      case 'remove_current':
        newCurrent = Math.max(0, currentPoints - amount);
        await db.updateUserPoints(user.id, newCurrent);
        break;

      case 'set_current':
        newCurrent = Math.max(0, amount);
        await db.updateUserPoints(user.id, newCurrent);
        break;

      case 'add_lifetime':
        newLifetime = currentLifetime + amount;
        lifetimeChanged = true;
        await db.addLifetimePoints(user.id, amount);
        break;

      case 'remove_lifetime':
        newLifetime = Math.max(0, currentLifetime - amount);
        lifetimeChanged = true;
        await db.updateLifetimePoints(user.id, newLifetime);
        break;

      case 'add_both':
        newCurrent = currentPoints + amount;
        newLifetime = currentLifetime + amount;
        lifetimeChanged = true;
        await db.updateUserPoints(user.id, newCurrent);
        await db.addLifetimePoints(user.id, amount);
        break;

      case 'remove_both':
        newCurrent = Math.max(0, currentPoints - amount);
        newLifetime = Math.max(0, currentLifetime - amount);
        lifetimeChanged = true;
        await db.updateUserPoints(user.id, newCurrent);
        await db.updateLifetimePoints(user.id, newLifetime);
        break;
    }

    if (lifetimeChanged) {
      await updateRank(user.id, interaction.guild);
    }

    await db.addPointLog(user.id, amount * (action.includes('remove') ? -1 : 1), reason, interaction.user.id);

    const updated = await db.getUserById(user.id);

    const embed = new EmbedBuilder()
      .setColor('Gold')
      .setTitle(`🛠 Points Updated for ${user.username}`)
      .addFields(
        { name: 'Action', value: action, inline: true },
        { name: 'Current Points', value: `${updated.points}`, inline: true },
        { name: 'Lifetime Points', value: `${updated.lifetime_points}`, inline: true },
        { name: 'Rank', value: getRankName(updated.lifetime_points), inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
  }
};
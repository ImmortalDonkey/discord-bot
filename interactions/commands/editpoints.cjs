// interactions/commands/editpoints.cjs
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('editpoints')
    .setDescription('Manually view or edit a player\'s points (STAFF ONLY)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to modify')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Choose how to modify points')
        .setRequired(true)
        .addChoices(
          { name: 'View', value: 'view' },
          { name: 'Add Points', value: 'add' },
          { name: 'Remove Points', value: 'remove' },
          { name: 'Set Points', value: 'set' }
        )
    )
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of points to modify (ignored for View)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for this change (optional)')
        .setRequired(false)
    ),

  async execute(client, interaction) {
    const target = interaction.options.getUser('user');
    const action = interaction.options.getString('action');
    const amount = interaction.options.getInteger('amount') || 0;
    const reason = interaction.options.getString('reason') || 'Manual adjustment';

    // ─────────────────────────────────────────────
    //  STAFF ROLE CHECK (STAFF_ROLES from .env)
    // ─────────────────────────────────────────────
    const staffRoles = (process.env.STAFF_ROLES || '')
      .split(',')
      .map(r => r.trim())
      .filter(Boolean);

    const hasStaffRole = interaction.member.roles.cache.some(r =>
      staffRoles.includes(r.id)
    );

    if (!hasStaffRole) {
      return interaction.reply({
        content: '❌ You do not have permission to use /editpoints.',
        flags: 64
      });
    }

    // ─────────────────────────────────────────────
    //  FETCH USER RECORD
    // ─────────────────────────────────────────────
    const row = await db.getUserById(target.id);

    if (!row && action !== 'add' && action !== 'set') {
      return interaction.reply({
        content: '❌ This user does not have a record yet.',
        flags: 64
      });
    }

    let newPoints = row?.points || 0;

    // ─────────────────────────────────────────────
    //  APPLY ACTION
    // ─────────────────────────────────────────────
    if (action === 'view') {
      const embed = new EmbedBuilder()
        .setColor('Blue')
        .setTitle(`📊 Points for ${target.username}`)
        .addFields(
          { name: 'Current Points', value: String(row?.points || 0), inline: true },
          { name: 'Lifetime Points', value: String(row?.lifetime_points || 0), inline: true },
          { name: 'Rank', value: getRankName(row?.lifetime_points || 0), inline: true }
        );

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (!amount || amount <= 0) {
      return interaction.reply({
        content: '❌ Please provide a valid amount (> 0).',
        flags: 64
      });
    }

    if (action === 'add') {
      newPoints = newPoints + amount;
      await db.addPoints(target.id, target.username, amount, reason);
    }

    if (action === 'remove') {
      newPoints = Math.max(0, newPoints - amount);
      await db.updateUserPoints(target.id, newPoints);
    }

    if (action === 'set') {
      newPoints = Math.max(0, amount);
      await db.updateUserPoints(target.id, newPoints);
    }

    // ─────────────────────────────────────────────
    //  RESPOND WITH UPDATED INFO
    // ─────────────────────────────────────────────
    const updated = await db.getUserById(target.id);

    const embed = new EmbedBuilder()
      .setColor('Gold')
      .setTitle(`🛠 Points Updated for ${target.username}`)
      .addFields(
        { name: 'Action', value: action, inline: true },
        { name: 'New Points', value: String(updated.points), inline: true },
        { name: 'Lifetime Points', value: String(updated.lifetime_points), inline: true },
        { name: 'Rank', value: getRankName(updated.lifetime_points), inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
  }
};
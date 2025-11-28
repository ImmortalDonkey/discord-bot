// interactions/commands/claim.cjs
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Convert your points into PKD (opens a staff review thread)')
    .addIntegerOption(option =>
      option.setName('points')
        .setDescription('How many points you want to claim')
        .setRequired(true)
    ),

  async execute(client, interaction) {
    const user = interaction.user;
    const pointsRequested = interaction.options.getInteger('points');

    // Get current points from DB
    const row = await db.getUserById(user.id);
    const currentPoints = row?.points || 0;

    if (pointsRequested <= 0) {
      return interaction.reply({
        content: '❌ Points must be greater than zero.',
        ephemeral: true
      });
    }

    if (pointsRequested > currentPoints) {
      return interaction.reply({
        content: `❌ You only have **${currentPoints}** points available.`,
        ephemeral: true
      });
    }

    const pkdValue = pointsRequested * 200000;
    const lifetime = row?.lifetime_points || 0;
    const rankName = getRankName(lifetime);

    // Get claims forum
    const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
    const forum = forumId
      ? await interaction.guild.channels.fetch(forumId).catch(() => null)
      : null;

    if (!forum) {
      return interaction.reply({
        content: '❌ Claims forum channel not found. Ask an admin to check `CLAIMS_FORUM_CHANNEL_ID`.',
        ephemeral: true
      });
    }

    // Staff mention from env
    const staffRolesEnv = process.env.STAFF_ROLES || '';
    const staffMention = staffRolesEnv
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(id => `<@&${id}>`)
      .join(' ');

    // Create forum thread
    const thread = await forum.threads.create({
      name: `Claim • ${user.username} • ${pointsRequested} pts`,
      message: {
        content: `${staffMention} New claim request from <@${user.id}>`
      }
    });

    // Build claim embed
    const embed = new EmbedBuilder()
      .setColor('Gold')
      .setTitle('💱 Point Claim Request')
      .addFields(
        { name: 'User', value: `<@${user.id}>`, inline: true },
        { name: 'Rank', value: rankName, inline: true },
        { name: 'Points Requested', value: String(pointsRequested), inline: true },
        { name: 'PKD Value', value: `${pkdValue.toLocaleString()} pkd`, inline: true },
        { name: 'Current Points', value: String(currentPoints), inline: true }
      )
      .setTimestamp();

    // Buttons (note: no Deny, just Approve)
    const rowButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claimapprove_${user.id}_${pointsRequested}`)
        .setLabel('Approve Claim')
        .setStyle(ButtonStyle.Success)
    );

    await thread.send({ embeds: [embed], components: [rowButtons] });

    return interaction.reply({
      content: `🧾 Your claim request has been submitted: <#${thread.id}>`,
      ephemeral: true
    });
  }
};
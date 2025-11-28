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
    const rankName = getRankName(row?.lifetime_points || 0);

    // ────────────────────────────────────────────────
    // FETCH CLAIMS FORUM
    // ────────────────────────────────────────────────
    const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
    const forum = forumId
      ? await interaction.guild.channels.fetch(forumId).catch(() => null)
      : null;

    if (!forum) {
      return interaction.reply({
        content: '❌ Claims forum not found. Check `CLAIMS_FORUM_CHANNEL_ID`.',
        ephemeral: true
      });
    }

    // Staff roles mention
    const staffRolesEnv = process.env.STAFF_ROLES || '';
    const staffMention = staffRolesEnv
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .map(id => `<@&${id}>`)
      .join(' ');

    // ────────────────────────────────────────────────
    // CREATE THREAD
    // ────────────────────────────────────────────────
    const thread = await forum.threads.create({
      name: `Claim • ${user.username} • ${pointsRequested} pts`,
      message: {
        content: `${staffMention} New claim request from <@${user.id}>`
      }
    });

    // ────────────────────────────────────────────────
    // EMBED
    // ────────────────────────────────────────────────
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

    // ────────────────────────────────────────────────
    // APPROVE BUTTON ONLY
    // ────────────────────────────────────────────────
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
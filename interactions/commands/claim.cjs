// interactions/commands/claim.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
  name: "claim",

  async execute(client, interaction) {
    const user = interaction.user;
    const pointsRequested = interaction.options.getInteger("points");

    const row = await db.getUserById(user.id);
    const currentPoints = row?.points || 0;

    if (pointsRequested <= 0) {
      return interaction.reply({
        content: "❌ Points must be greater than zero.",
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

    const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
    const forum = await interaction.guild.channels.fetch(forumId).catch(() => null);

    if (!forum) {
      return interaction.reply({
        content: "❌ Claims forum channel not found. Ask an admin to check `CLAIMS_FORUM_CHANNEL_ID`.",
        ephemeral: true
      });
    }

    // Create forum thread
    const thread = await forum.threads.create({
      name: `Claim • ${user.username} • ${pointsRequested} pts`,
      message: {
        content: `<@&STAFF_ROLE_ID> New claim request from <@${user.id}>`, // replace if needed
      }
    });

    // Build claim embed
    const embed = new EmbedBuilder()
      .setColor('Gold')
      .setTitle(`Point Claim Request`)
      .addFields(
        { name: "User", value: `<@${user.id}>`, inline: true },
        { name: "Rank", value: rankName, inline: true },
        { name: "Points Requested", value: String(pointsRequested), inline: true },
        { name: "PKD Value", value: `${pkdValue.toLocaleString()} pkd`, inline: true }
      )
      .setTimestamp();

    // Buttons
    const rowButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_approve_${user.id}_${pointsRequested}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`claim_deny_${user.id}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    );

    await thread.send({ embeds: [embed], components: [rowButtons] });

    return interaction.reply({
      content: `🧾 Your claim request has been submitted: <#${thread.id}>`,
      ephemeral: true
    });
  }
};


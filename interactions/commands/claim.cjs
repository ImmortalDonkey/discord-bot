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

    // Ensure state map exists
    if (!client.bountyClaims) client.bountyClaims = new Map();

    // Fetch user balance
    const row = await db.getUserById(user.id);
    const currentPoints = row?.points || 0;
    const lifetime = row?.lifetime_points || 0;
    const rankName = getRankName(lifetime);

    // Validation
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

    // PKD conversion
    const pkdValue = pointsRequested * 200_000;

    // Claims forum
    const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
    const forum = await interaction.guild.channels.fetch(forumId).catch(() => null);

    if (!forum) {
      return interaction.reply({
        content: "❌ Claims forum channel not found. Check `CLAIMS_FORUM_CHANNEL_ID`.",
        ephemeral: true
      });
    }

    // Create forum thread
    const thread = await forum.threads.create({
      name: `Claim • ${user.username} • ${pointsRequested} pts`,
      message: {
        content: `📨 New claim request from <@${user.id}>`
      }
    });

    // Store claim in memory
    client.bountyClaims.set(thread.id, {
      userId: user.id,
      points: pointsRequested,
      pkd: pkdValue,
      status: "pending",
      createdAt: Date.now()
    });

    // Embed
    const embed = new EmbedBuilder()
      .setColor('Gold')
      .setTitle(`Point Claim Request`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "User", value: `<@${user.id}>`, inline: true },
        { name: "Rank", value: rankName, inline: true },
        { name: "Points Requested", value: `${pointsRequested}`, inline: true },
        { name: "PKD Value", value: `${pkdValue.toLocaleString()} pkd`, inline: true }
      )
      .setTimestamp();

    // Buttons
    const rowButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_approve_${thread.id}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`claim_deny_${thread.id}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    );

    await thread.send({
      embeds: [embed],
      components: [rowButtons]
    });

    // DM the user
    user.send({
      content: `🧾 Your claim request for **${pointsRequested} points** (${pkdValue.toLocaleString()} pkd) has been submitted.\n\nYou’ll be notified when it is approved or denied.`
    }).catch(() => {});

    return interaction.reply({
      content: `🧾 Your claim request has been submitted.\nThread: <#${thread.id}>`,
      ephemeral: true
    });
  }
};

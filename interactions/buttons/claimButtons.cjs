// interactions/buttons/claimButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');

const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');

module.exports = {
  ids: ["claimapprove_", "claimclose_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    if (id.startsWith("claimapprove_")) {
      return approveClaim(client, interaction);
    }

    if (id.startsWith("claimclose_")) {
      return closeClaimThread(client, interaction);
    }
  }
};

// ─────────────────────────────────────────────
// APPROVE CLAIM
// ─────────────────────────────────────────────
async function approveClaim(client, interaction) {
  const parts = interaction.customId.split("_");
  // claimapprove_<userId>_<points>
  const userId = parts[1];
  const pointsRequested = parseInt(parts[2], 10);

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: "❌ You do not have permission to approve claims.",
      ephemeral: true
    });
  }

  const row = await db.getUserById(userId);
  if (!row) {
    return interaction.reply({
      content: "❌ User not found in the system.",
      ephemeral: true
    });
  }

  const newPoints = Math.max(0, (row.points || 0) - pointsRequested);
  const pkdValue = pointsRequested * 200000;

  // Update DB
  await db.updateUserPoints(userId, newPoints);

  // Build updated embed
  const oldEmbed = interaction.message.embeds[0];
  const updatedEmbed = EmbedBuilder.from(oldEmbed)
    .setColor("Green")
    .setFields(
      { name: "User", value: `<@${userId}>`, inline: true },
      { name: "Rank", value: getRankName(row.lifetime_points), inline: true },
      { name: "Points Requested", value: String(pointsRequested), inline: true },
      { name: "PKD Value", value: `${pkdValue.toLocaleString()} pkd`, inline: true },
      { name: "Current Points (After Claim)", value: String(newPoints), inline: true },
      { name: "Status", value: `✅ Approved by <@${interaction.user.id}>`, inline: false }
    );

  // Provide "Close Claim" button
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claimclose_${interaction.channel.id}`)
      .setLabel("Close Claim")
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({
    embeds: [updatedEmbed],
    components: [closeRow]
  });

  // Try DM the user
  try {
    const u = await client.users.fetch(userId);
    await u.send(
      `💱 Your claim of **${pointsRequested} points** has been approved!\nYou receive **${pkdValue.toLocaleString()} pkd**.`
    );
  } catch (e) {}

  return;
}

// ─────────────────────────────────────────────
// CLOSE CLAIM THREAD
// ─────────────────────────────────────────────
async function closeClaimThread(client, interaction) {
  const threadId = interaction.customId.replace("claimclose_", "");
  const thread = interaction.guild.channels.cache.get(threadId);

  if (!thread) {
    return interaction.reply({
      content: "❌ Unable to find this thread.",
      ephemeral: true
    });
  }

  await interaction.reply({
    content: "🕒 This claim thread will be deleted in **1 minute**.",
    ephemeral: true
  });

  setTimeout(async () => {
    try {
      await thread.delete();
    } catch (err) {
      console.error("❌ Failed to delete claim thread:", err);
    }
  }, 60000);
}
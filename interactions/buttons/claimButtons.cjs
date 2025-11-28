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
  ids: ["claim_approve_", "claim_close_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    if (id.startsWith("claim_approve_")) {
      return approveClaim(client, interaction);
    }

    if (id.startsWith("claim_close_")) {
      return closeClaimThread(client, interaction);
    }
  }
};


// ─────────────────────────────────────────────
// APPROVE CLAIM BUTTON
// ─────────────────────────────────────────────
async function approveClaim(client, interaction) {
  const parts = interaction.customId.split("_");

  // claim_approve_<userId>_<points>
  const userId = parts[2];
  const pointsRequested = parseInt(parts[3], 10);

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: "❌ You do not have permission to approve claims.",
      flags: 64
    });
  }

  // Fetch user from DB
  const row = await db.getUserById(userId);
  if (!row) {
    return interaction.reply({
      content: "❌ Could not find this user in the database.",
      flags: 64
    });
  }

  const currentPoints = row.points || 0;
  const newPoints = Math.max(0, currentPoints - pointsRequested);
  const pkdValue = pointsRequested * 200000;

  // Update DB
  await db.updateUserPoints(userId, newPoints);

  // Update embed
  const oldEmbed = interaction.message.embeds[0];
  const updatedEmbed = EmbedBuilder.from(oldEmbed)
    .setColor("Green")
    .setFields(
      { name: "User", value: `<@${userId}>`, inline: true },
      { name: "Rank", value: getRankName(row.lifetime_points), inline: true },
      { name: "Points Requested", value: String(pointsRequested), inline: true },
      { name: "PKD Value", value: `${pkdValue.toLocaleString()} pkd`, inline: true },
      { name: "Current Points (After Claim)", value: String(newPoints), inline: true },
      { name: "Status", value: `✅ Approved by <@${interaction.user.id}>` }
    );

  // Add CLOSE CLAIM button
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim_close_${interaction.channel.id}`)
      .setLabel("Close Claim")
      .setStyle(ButtonStyle.Secondary)
  );

  // Update message
  await interaction.update({
    embeds: [updatedEmbed],
    components: [closeRow]
  });

  // DM the user
  try {
    const targetUser = await client.users.fetch(userId);
    await targetUser.send(
      `💱 Your claim of **${pointsRequested} points** was approved.\n` +
      `You receive **${pkdValue.toLocaleString()} pkd**.`
    );
  } catch {}

  return;
}


// ─────────────────────────────────────────────
// CLOSE CLAIM THREAD BUTTON
// ─────────────────────────────────────────────
async function closeClaimThread(client, interaction) {
  const threadId = interaction.customId.replace("claim_close_", "");
  const thread = interaction.guild.channels.cache.get(threadId);

  if (!thread) {
    return interaction.reply({
      content: "❌ Could not find this thread.",
      flags: 64
    });
  }

  await interaction.reply({
    content: "🕒 This claim thread will be deleted in **1 minute**.",
    flags: 64
  });

  setTimeout(async () => {
    try {
      await thread.delete();
    } catch (err) {
      console.error("Failed to delete claim thread:", err);
    }
  }, 60000);
}
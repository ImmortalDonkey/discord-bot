// interactions/commands/leaderboarddebug.cjs
const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

const db = require("../../database.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const { createLeaderboardCard } = require("../../renderers/leaderboardCard.cjs");

// ENV: comma-separated staff roles
const STAFF_ROLES = process.env.STAFF_ROLES
  ? process.env.STAFF_ROLES.split(",")
  : [];

function userIsStaff(member) {
  if (!member) return false;
  return STAFF_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// Rank badge mapping (TEMP text icons)
const RANK_BADGES = {
  "Rookie Trainer": "⚪",
  "Trainer": "🔵",
  "Ace Trainer": "🟡",
  "Gym Challenger": "⚪",
  "Gym Leader": "🟥",
  "Elite Four": "🟪",
  "Champion": "❤️",
  "Master": "🌀"
};

function getBadge(rank) {
  return RANK_BADGES[rank] || "⚪";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboarddebug")
    .setDescription("Debug leaderboard with card rendering — Staff Only")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(client, interaction) {

    // Staff role enforcement (architecture rule)
    if (!userIsStaff(interaction.member)) {
      return interaction.reply({
        content: "🚫 Only staff members can use this command.",
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: false });

    const guild = interaction.guild;
    const list = await db.getLeaderboard(10);

    if (!list || list.length === 0) {
      return interaction.editReply("No leaderboard data available yet.");
    }

    // Render the card
    const buffer = await createLeaderboardCard(guild);

    // Send the PNG card
    return interaction.editReply({
      files: [{ attachment: buffer, name: "leaderboard.png" }]
    });
  }
};
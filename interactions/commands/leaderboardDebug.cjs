// interactions/commands/leaderboarddebug.cjs
//
// Staff-only debug command that renders the leaderboard as a PNG card.
//
// Uses:
// - database.cjs for leaderboard data
// - renderers/leaderboardCard.cjs for PNG
// - STAFF_ROLES from .env for access control

const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

const db = require("../../database.cjs");
const { createLeaderboardCard } = require("../../renderers/leaderboardCard.cjs");

// ENV: comma-separated staff roles
const STAFF_ROLES = process.env.STAFF_ROLES
  ? process.env.STAFF_ROLES.split(",")
  : [];

/**
 * Check if the member has any of the staff roles defined in .env STAFF_ROLES
 */
function userIsStaff(member) {
  if (!member) return false;
  if (!STAFF_ROLES.length) return false;
  return STAFF_ROLES.some((roleId) => member.roles.cache.has(roleId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboarddebug")
    .setDescription("Debug the leaderboard PNG card (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(client, interaction) {
    // Staff only, according to architecture
    if (!userIsStaff(interaction.member)) {
      return interaction.reply({
        content: "🚫 Only staff members can use this command.",
        ephemeral: true
      });
    }

    // Quick check if there is any data
    const rows = await db.getLeaderboard(1);
    if (!rows || rows.length === 0) {
      return interaction.reply({
        content: "No leaderboard data available yet.",
        ephemeral: true
      });
    }

    // Render PNG card
    const buffer = await createLeaderboardCard(interaction.guild);

    // IMPORTANT: send *only* an attachment.
    // No embeds, no URLs → gives Discord best chance to show the full image inline.
    return interaction.reply({
      files: [
        {
          attachment: buffer,
          name: `leaderboard_${Date.now()}.png`
        }
      ]
    });
  }
};
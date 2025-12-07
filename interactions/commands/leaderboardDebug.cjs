const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

const { getAllUsers } = require("../../database.cjs");
const { createLeaderboardCards } = require("../../renderers/leaderboardCard.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES
  ? process.env.STAFF_ROLES.split(",")
  : [];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboarddebug")
    .setDescription("Staff only — render leaderboard debug cards"),

  async execute(client, interaction) {
    try {
      // 🔐 Staff only
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
        return interaction.reply({
          content: "❌ You do not have permission to use this command.",
          flags: 64 // ephemeral replacement
        });
      }

      await interaction.deferReply({ flags: 64 });

      const users = await getAllUsers();
      const sorted = [...users].sort(
        (a, b) => (b.lifetime_points || 0) - (a.lifetime_points || 0)
      );

      const files = await createLeaderboardCards(sorted, interaction.guild);

      // Send pages separately
      for (const img of files) {
        await interaction.followUp({ files: [img] });
      }
    } catch (err) {
      console.error("❌  Failed to render leaderboard card:", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Failed to render leaderboard card. Check bot logs for details.",
          flags: 64
        });
      } else {
        await interaction.followUp({
          content: "❌ Failed to render leaderboard card. Check bot logs for details.",
          flags: 64
        });
      }
    }
  }
};
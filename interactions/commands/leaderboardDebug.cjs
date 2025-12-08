// interactions/commands/leaderboardDebug.cjs
//
// Staff-only debug command to render the Top 10 leaderboard PNG.
// This version has NO paging logic — always shows ranks #1–10 only.

const {
  SlashCommandBuilder,
  AttachmentBuilder
} = require("discord.js");

const { createLeaderboardCard } = require("../../renderers/leaderboardCard.cjs");

const STAFF_ROLES = (process.env.STAFF_ROLES || "")
  .split(",")
  .map(r => r.trim())
  .filter(Boolean);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboarddebug")
    .setDescription("Render the Top 10 leaderboard card (staff only)"),

  async execute(client, interaction) {
    try {
      // Defer immediately to avoid timeout
      await interaction.deferReply({ ephemeral: false });

      // Staff-role check
      const member = interaction.member;
      const hasStaffRole =
        member &&
        member.roles &&
        STAFF_ROLES.some(roleId => member.roles.cache.has(roleId));

      if (!hasStaffRole) {
        return interaction.editReply({
          content: "❌ You do not have permission to use this command."
        });
      }

      // Always produce Top 10
      const buffer = await createLeaderboardCard(interaction.guild);
      const attachment = new AttachmentBuilder(buffer, {
        name: `top-hunters-leaderboard.png`
      });

      await interaction.editReply({ files: [attachment] });
    } catch (err) {
      console.error("❌ Failed to render leaderboard card:", err);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(
          "❌ Failed to render leaderboard card. Check bot logs for details."
        );
      } else {
        await interaction.reply({
          content:
            "❌ Failed to render leaderboard card before response could be sent.",
          ephemeral: true
        });
      }
    }
  }
};
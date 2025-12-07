// interactions/commands/leaderboardDebug.cjs
//
// Staff-only debug command to render the leaderboard PNG.
// /leaderboarddebug [page]
// page: 1 → ranks #1–10 (default)
// page: 2 → ranks #11–20

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
    .setDescription("Render the Top Hunters leaderboard card (staff only)")
    .addIntegerOption(option =>
      option
        .setName("page")
        .setDescription("Leaderboard page: 1 (ranks 1–10) or 2 (ranks 11–20)")
        .setMinValue(1)
        .setMaxValue(2)
    ),

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

      const page = interaction.options.getInteger("page") || 1;

      const buffer = await createLeaderboardCard(interaction.guild, page);
      const attachment = new AttachmentBuilder(buffer, {
        name: `top-hunters-leaderboard-page${page}.png`
      });

      // Image only, no embed, to bypass preview mode
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
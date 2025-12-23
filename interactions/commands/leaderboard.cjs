// interactions/commands/leaderboard.cjs
//
// Public command to render the Top Hunters leaderboard card.
// Uses the Canvas renderer (same as debug version).

const {
  SlashCommandBuilder,
  AttachmentBuilder
} = require("discord.js");

const { createLeaderboardCard } = require("../../renderers/leaderboardCard.cjs");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the Top Hunters leaderboard"),

  async execute(client, interaction) {
    try {
      // Defer immediately to avoid interaction timeout
      await interaction.deferReply({ ephemeral: false });

      // Render leaderboard card (page 1 = ranks 1–10)
      const buffer = await createLeaderboardCard(interaction.guild, 1);

      const attachment = new AttachmentBuilder(buffer, {
        name: "top-hunters-leaderboard.png"
      });

      // Send image only (no embed)
      await interaction.editReply({
        files: [attachment]
      });
    } catch (err) {
      console.error("❌ Failed to render leaderboard card:", err);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(
          "❌ Failed to render leaderboard. Please try again later."
        );
      } else {
        await interaction.reply({
          content:
            "❌ Failed to render leaderboard before response could be sent.",
          ephemeral: true
        });
      }
    }
  }
};
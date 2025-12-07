// interactions/commands/leaderboarddebug.cjs
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const db = require("../../database.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");

// Rank badge mapping
const RANK_ICONS = {
  "Rookie Trainer": "⚪ Poké Ball",        // You can change to image URLs later
  "Trainer": "🔵 Great Ball",
  "Ace Trainer": "🟡 Ultra Ball",
  "Gym Challenger": "⚪ Premier Ball",
  "Gym Leader": "🟥 Master Ball",
  "Elite Four": "🟪 Beast Ball",
  "Champion": "❤️ Cherish Ball",
  "Master": "🌀 Vortex Ball"
};

// Pick correct icon
function getBadgeForRank(rankName) {
  return RANK_ICONS[rankName] || "⚪ Poké Ball";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboarddebug")
    .setDescription("Staff-only: Debug leaderboard display")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(client, interaction) {
    await interaction.deferReply({ ephemeral: false });

    const rows = await db.getLeaderboard(20);
    if (!rows || rows.length === 0) {
      return interaction.editReply("No leaderboard data yet.");
    }

    const guild = interaction.guild;

    // Build table
    const lines = rows.map((user, i) => {
      const member = guild.members.cache.get(user.discord_id);
      const nickname = member?.nickname || user.username || "Unknown";

      const lifetime = user.lifetime_points || 0;
      const rankName = getRankName(lifetime);
      const badge = getBadgeForRank(rankName);

      return `**#${i + 1}**  —  **${nickname}** (${rankName}) — **${lifetime} pts** — ${badge}`;
    });

    const embed = new EmbedBuilder()
      .setColor("Gold")
      .setTitle("📊 Points Leaderboard (Debug)")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "Debug view — not using rendered image" });

    return interaction.editReply({ embeds: [embed] });
  }
};
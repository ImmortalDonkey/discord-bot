// renderers/leaderboardCard.cjs
const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

// Card Size
const WIDTH = 2400;
const HEIGHT = 1400;
const PADDING = 70;

// Rank Badge Icons (TEMP text versions — will replace with PNG assets later)
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

/**
 * Render leaderboard card image
 */
async function createLeaderboardCard(guild) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#1e293b");
  gradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Card title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 80px Sans";
  ctx.fillText("Top Hunters", PADDING, PADDING + 30);

  // Column Headers
  ctx.fillStyle = "#ffdd00";
  ctx.font = "bold 55px Sans";
  const headers = ["#", "Trainer", "Rank", "Points", "Badge"];
  const colX = [PADDING, 200, 900, 1500, 2000];

  headers.forEach((text, i) => {
    ctx.fillText(text, colX[i], PADDING + 200);
  });

  // Table Data
  const list = await db.getLeaderboard(10);
  ctx.font = "45px Sans";
  ctx.fillStyle = "#ffffff";

  const rowHeight = 110;
  let offsetY = PADDING + 300;

  list.forEach((user, i) => {
    const member = guild.members.cache.get(user.discord_id);
    const displayName = member?.nickname || user.username || "Unknown";
    const rank = getRankName(user.lifetime_points || 0);
    const badge = getBadge(rank);

    const row = [
      `#${i + 1}`,
      displayName,
      rank,
      `${user.lifetime_points || 0}`,
      badge
    ];

    row.forEach((text, ci) => {
      ctx.fillText(text, colX[ci], offsetY);
    });

    offsetY += rowHeight;
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
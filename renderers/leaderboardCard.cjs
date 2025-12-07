// renderers/leaderboardCard.cjs
//
// Renders a PNG leaderboard card with columns:
// # | Trainer | Rank | Points | Bounties | Badge
//
// - Uses lifetime_points for ranking
// - Shows completed_bounties
// - Uses server nickname with fallback to stored username
// - Rank → Poké Ball badge mapping (image if present, otherwise emoji/text)
// - Top 3 get 🥇 🥈 🥉 in the # column

const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

// Card size (similar vibe to bounty cards)
const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1400;
const PADDING = 80;

// Badge image folder (you'll add PNGs here later)
const BADGE_DIR = path.join(__dirname, "rank-badges");

// Mapping rank → badge filename (without worrying if they exist yet)
const RANK_BADGE_FILES = {
  "Rookie Trainer": "pokeball.png",
  "Trainer": "greatball.png",
  "Ace Trainer": "ultraball.png",
  "Gym Challenger": "premierball.png",
  "Gym Leader": "masterball.png",
  "Elite Four": "beastball.png",
  "Champion": "cherishball.png",
  "Master": "vortexball.png"
};

// Fallback emoji for badges if image is missing
const RANK_BADGE_EMOJI = {
  "Rookie Trainer": "⚪",
  "Trainer": "🔵",
  "Ace Trainer": "🟡",
  "Gym Challenger": "⚪",
  "Gym Leader": "🟥",
  "Elite Four": "🟪",
  "Champion": "❤️",
  "Master": "🌀"
};

function getBadgeFileForRank(rankName) {
  return RANK_BADGE_FILES[rankName] || null;
}

function getBadgeEmojiForRank(rankName) {
  return RANK_BADGE_EMOJI[rankName] || "⚪";
}

function fileExistsSafe(fullPath) {
  try {
    return fs.existsSync(fullPath);
  } catch {
    return false;
  }
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Truncate text to fit maxWidth with ellipsis.
 */
function fillTruncatedText(ctx, text, x, y, maxWidth) {
  const full = String(text || "");
  if (ctx.measureText(full).width <= maxWidth) {
    ctx.fillText(full, x, y);
    return;
  }

  let trimmed = full;
  while (trimmed.length > 0 && ctx.measureText(trimmed + "…").width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  ctx.fillText(trimmed + "…", x, y);
}

/**
 * Create the leaderboard card.
 * @param {Guild} guild - Discord guild, used for nickname lookup
 * @returns {Buffer} PNG buffer
 */
async function createLeaderboardCard(guild) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, "#020617"); // slate-950
  gradient.addColorStop(0.5, "#0f172a"); // slate-900
  gradient.addColorStop(1, "#020617");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Subtle overlay
  ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Main inner card
  const innerX = PADDING;
  const innerY = PADDING;
  const innerW = CARD_WIDTH - PADDING * 2;
  const innerH = CARD_HEIGHT - PADDING * 2;

  ctx.save();
  drawRoundedRect(ctx, innerX, innerY, innerW, innerH, 40);
  ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(148, 163, 184, 0.9)";
  ctx.stroke();
  ctx.restore();

  // Title
  ctx.fillStyle = "#fbbf24"; // amber-400
  ctx.font = "bold 80px Sans";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Top Hunters Leaderboard", innerX + 40, innerY + 30);

  // Subtitle
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "bold 40px Sans";
  ctx.fillText("Ranked by lifetime points", innerX + 40, innerY + 120);

  // Column setup
  const headerY = innerY + 220;
  const firstRowY = headerY + 80;
  const rowHeight = 90;

  // Column X positions for:
  // # | Trainer | Rank | Points | Bounties | Badge
  const colRankNumX = innerX + 60;
  const colTrainerX = innerX + 200;
  const colRankNameX = innerX + 800;
  const colPointsX = innerX + 1350;
  const colBountiesX = innerX + 1700;
  const colBadgeX = innerX + 2050;

  // Column headers
  ctx.fillStyle = "#38bdf8"; // sky-400
  ctx.font = "bold 50px Sans";
  ctx.textBaseline = "alphabetic";

  ctx.fillText("#", colRankNumX, headerY);
  ctx.fillText("Trainer", colTrainerX, headerY);
  ctx.fillText("Rank", colRankNameX, headerY);
  ctx.fillText("Points", colPointsX, headerY);
  ctx.fillText("Bounties", colBountiesX, headerY);
  ctx.fillText("Badge", colBadgeX, headerY);

  // Header underline
  ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(innerX + 40, headerY + 20);
  ctx.lineTo(innerX + innerW - 40, headerY + 20);
  ctx.stroke();

  // Fetch leaderboard data (top 10)
  const rows = await db.getLeaderboard(10);

  ctx.font = "45px Sans";
  ctx.fillStyle = "#e5e7eb";
  ctx.textAlign = "left";

  for (let i = 0; i < rows.length; i++) {
    const user = rows[i];
    const rowY = firstRowY + i * rowHeight;

    const member = guild.members.cache.get(user.discord_id);
    const displayName = member?.nickname || user.username || "Unknown";
    const lifetimePoints = user.lifetime_points || 0;
    const completedBounties = user.completed_bounties || 0;
    const rankName = getRankName(lifetimePoints);

    // Zebra row background
    if (i % 2 === 0) {
      ctx.save();
      drawRoundedRect(
        ctx,
        innerX + 30,
        rowY - rowHeight + 20,
        innerW - 60,
        rowHeight - 10,
        20
      );
      ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
      ctx.fill();
      ctx.restore();
    }

    // # column with medals
    ctx.textAlign = "left";
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "bold 45px Sans";

    let rankLabel = `#${i + 1}`;
    if (i === 0) rankLabel = "🥇 #1";
    else if (i === 1) rankLabel = "🥈 #2";
    else if (i === 2) rankLabel = "🥉 #3";

    ctx.fillText(rankLabel, colRankNumX, rowY);

    // Trainer (truncate if too long)
    ctx.font = "45px Sans";
    ctx.fillStyle = "#f9fafb";
    ctx.textAlign = "left";
    const maxTrainerWidth = colRankNameX - colTrainerX - 40;
    fillTruncatedText(ctx, displayName, colTrainerX, rowY, maxTrainerWidth);

    // Rank name
    ctx.fillStyle = "#e5e7eb";
    const maxRankWidth = colPointsX - colRankNameX - 40;
    fillTruncatedText(ctx, rankName, colRankNameX, rowY, maxRankWidth);

    // Points (right-aligned number-ish)
    ctx.textAlign = "right";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(String(lifetimePoints), colPointsX + 120, rowY);

    // Bounties completed
    ctx.fillStyle = "#a5b4fc"; // indigo-300
    ctx.fillText(String(completedBounties), colBountiesX + 100, rowY);

    // Badge (image if present, else emoji)
    const badgeFile = getBadgeFileForRank(rankName);
    const badgePath =
      badgeFile && fileExistsSafe(path.join(BADGE_DIR, badgeFile))
        ? path.join(BADGE_DIR, badgeFile)
        : null;

    if (badgePath) {
      try {
        const img = await loadImage(badgePath);
        const size = 70;
        const bx = colBadgeX;
        const by = rowY - size + 20;

        ctx.save();
        drawRoundedRect(ctx, bx - 10, by - 10, size + 20, size + 20, 16);
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.fill();
        ctx.restore();

        ctx.drawImage(img, bx, by, size, size);
      } catch {
        // fallback emoji
        ctx.textAlign = "left";
        ctx.fillStyle = "#e5e7eb";
        ctx.fillText(getBadgeEmojiForRank(rankName), colBadgeX, rowY);
      }
    } else {
      // No image available → use emoji
      ctx.textAlign = "left";
      ctx.fillStyle = "#e5e7eb";
      ctx.fillText(getBadgeEmojiForRank(rankName), colBadgeX, rowY);
    }
  }

  return canvas.toBuffer("image/png");
}

module.exports = {
  createLeaderboardCard
};
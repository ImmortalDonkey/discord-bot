
// renderers/leaderboardCard.cjs
//
// Renders a PNG leaderboard card with columns:
// # | Trainer (badge + name) | Rank | Points | Bounties
//
// - 4:3 aspect ratio: 2400 x 1800
// - Shows 10 players per page:
//     page 1 → ranks #1–10
//     page 2 → ranks #11–20
// - White background with grid lines
// - Badge icon appears inside the Trainer column, before the trainer name
// - Uses server nickname with fallback to stored username

const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

// 4:3
const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1800;
const PADDING = 80;

// Badge image folders (support both paths just in case)
const BADGE_DIR_PRIMARY = path.join(__dirname, "rank-badges");
const BADGE_DIR_SECONDARY = path.join(__dirname, "badges");

const RANK_BADGE_FILES = {
  "Rookie Trainer": "pokeball.png",
  Trainer: "great-ball.png",
  "Ace Trainer": "ultra-ball.png",
  "Gym Challenger": "premier-ball.png",
  "Gym Leader": "master-ball.png",
  "Elite Four": "beast-ball.png",
  Champion: "cherish-ball.png",
  Master: "vortex-ball.png"
};

const RANK_BADGE_FALLBACK = {
  "Rookie Trainer": "P",
  Trainer: "G",
  "Ace Trainer": "U",
  "Gym Challenger": "Pr",
  "Gym Leader": "M",
  "Elite Four": "B",
  Champion: "C",
  Master: "V"
};

function getBadgeFileForRank(rankName) {
  return RANK_BADGE_FILES[rankName] || null;
}
function getBadgeFallbackForRank(rankName) {
  return RANK_BADGE_FALLBACK[rankName] || "";
}

function fileExistsSafe(fullPath) {
  try {
    return fs.existsSync(fullPath);
  } catch {
    return false;
  }
}

function getBadgePath(rankName) {
  const file = getBadgeFileForRank(rankName);
  if (!file) return null;

  const primary = path.join(BADGE_DIR_PRIMARY, file);
  if (fileExistsSafe(primary)) return primary;

  const secondary = path.join(BADGE_DIR_SECONDARY, file);
  if (fileExistsSafe(secondary)) return secondary;

  return null;
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
function fillTruncatedText(ctx, text, x, y, maxWidth, align = "left") {
  ctx.textAlign = align;
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
 * Safely resolve a display name for a user from guild + DB row.
 * - Prefer guild nickname
 * - Then global name
 * - Then Discord username
 * - Then stored username
 */
async function resolveDisplayName(guild, userRow) {
  let displayName = userRow.username || "Unknown";

  if (!guild || !userRow.discord_id) {
    return displayName;
  }

  try {
    let member = guild.members.cache.get(userRow.discord_id);
    if (!member) {
      member = await guild.members.fetch(userRow.discord_id).catch(() => null);
    }

    if (member) {
      if (member.nickname) return member.nickname;
      if (member.user?.globalName) return member.user.globalName;
      if (member.user?.username) return member.user.username;
    }
  } catch {
    // ignore, fall back to stored username
  }

  return displayName;
}

/**
 * Create the leaderboard card.
 * @param {Guild} guild  Discord guild (for nickname lookup)
 * @param {number} page  1 → ranks 1–10, 2 → ranks 11–20
 * @returns {Buffer} PNG buffer
 */
async function createLeaderboardCard(guild, page = 1) {
  // Clamp page to 1 or 2
  const pageNum = page === 2 ? 2 : 1;

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Inner rounded card
  const innerX = PADDING;
  const innerY = PADDING;
  const innerW = CARD_WIDTH - PADDING * 2;
  const innerH = CARD_HEIGHT - PADDING * 2;

  ctx.save();
  drawRoundedRect(ctx, innerX, innerY, innerW, innerH, 40);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#9ca3af"; // gray-400
  ctx.stroke();
  ctx.restore();

  // Title
  ctx.fillStyle = "#111827"; // gray-900
  ctx.font = "bold 80px Sans";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Top Hunters Leaderboard", innerX + 50, innerY + 40);

  // Page indicator (top-right)
  ctx.fillStyle = "#6b7280"; // gray-500
  ctx.font = "bold 36px Sans";
  ctx.textAlign = "right";
  ctx.fillText(
    pageNum === 1 ? "Page 1 — Ranks #1–10" : "Page 2 — Ranks #11–20",
    innerX + innerW - 50,
    innerY + 55
  );

  // Table geometry
  const tableX = innerX + 70;
  const tableY = innerY + 170;
  const tableW = innerW - 140;
  const headerRowHeight = 90;
  const rowHeight = 100;
  const visibleRows = 10;
  const tableH = headerRowHeight + visibleRows * rowHeight;

  // Column boundaries (grid):
  // # | Trainer (badge+name) | Rank | Points | Bounties
  const col0 = tableX; // left border
  const col1 = col0 + 120; // after "#"
  const col2 = col1 + 700; // after Trainer+badge
  const col3 = col2 + 420; // after Rank
  const col4 = col3 + 300; // after Points
  const col5 = tableX + tableW; // right border

  // Column label positions (center of each col segment)
  const colRankNumCenterX = (col0 + col1) / 2;
  const colTrainerCenterX = (col1 + col2) / 2;
  const colRankCenterX = (col2 + col3) / 2;
  const colPointsCenterX = (col3 + col4) / 2;
  const colBountiesCenterX = (col4 + col5) / 2;

  // Draw table outer border
  ctx.save();
  drawRoundedRect(ctx, tableX, tableY, tableW, tableH, 20);
  ctx.strokeStyle = "#d1d5db"; // gray-300
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Grid lines (thicker)
  ctx.strokeStyle = "#e5e7eb"; // gray-200
  ctx.lineWidth = 2.5;

  // Vertical column lines
  ctx.beginPath();
  [col1, col2, col3, col4].forEach(x => {
    ctx.moveTo(x, tableY);
    ctx.lineTo(x, tableY + tableH);
  });
  ctx.stroke();

  // Horizontal lines for header + each row
  ctx.beginPath();
  const headerBottomY = tableY + headerRowHeight;
  ctx.moveTo(tableX, headerBottomY);
  ctx.lineTo(tableX + tableW, headerBottomY);
  for (let i = 1; i <= visibleRows; i++) {
    const y = headerBottomY + i * rowHeight;
    ctx.moveTo(tableX, y);
    ctx.lineTo(tableX + tableW, y);
  }
  ctx.stroke();

  // Column headers
  ctx.fillStyle = "#111827";
  ctx.font = "bold 46px Sans";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const headerCenterY = tableY + headerRowHeight / 2;
  ctx.fillText("#", colRankNumCenterX, headerCenterY);
  ctx.fillText("Trainer", colTrainerCenterX, headerCenterY);
  ctx.fillText("Rank", colRankCenterX, headerCenterY);
  ctx.fillText("Points", colPointsCenterX, headerCenterY);
  ctx.fillText("Bounties", colBountiesCenterX, headerCenterY);

  // Get leaderboard (top 20, then slice per page)
  const allRows = await db.getLeaderboard(20);
  const startIndex = (pageNum - 1) * 10;
  const endIndex = startIndex + 10;
  const rows = allRows.slice(startIndex, endIndex); // safe even if fewer rows

  // Row fonts
  ctx.textBaseline = "middle";

  for (let i = 0; i < visibleRows; i++) {
    const rowCenterY = headerBottomY + rowHeight * (i + 0.5);

    if (!rows[i]) {
      // Empty row – do nothing (grid already drawn)
      continue;
    }

    const user = rows[i];
    const globalRankNumber = startIndex + i + 1;
    const lifetimePoints = user.lifetime_points || 0;
    const completedBounties = user.completed_bounties || 0;
    const rankName = getRankName(lifetimePoints);

    const displayName = await resolveDisplayName(guild, user);

    // --- # column ---
    ctx.textAlign = "center";
    ctx.font = "bold 40px Sans";
    ctx.fillStyle =
      globalRankNumber === 1
        ? "#b45309" // highlight #1
        : "#111827";

    ctx.fillText(`#${globalRankNumber}`, colRankNumCenterX, rowCenterY);

    // --- Trainer column (badge + name) ---
    const trainerColLeft = col1;
    const trainerColRight = col2;
    const trainerPadding = 30;

    const badgeSize = 52;
    const badgeCenterY = rowCenterY;
    const badgeX = trainerColLeft + trainerPadding + badgeSize / 2;

    const badgePath = getBadgePath(rankName);

    if (badgePath) {
      try {
        const img = await loadImage(badgePath);
        const drawX = badgeX - badgeSize / 2;
        const drawY = badgeCenterY - badgeSize / 2;
        ctx.drawImage(img, drawX, drawY, badgeSize, badgeSize);
      } catch {
        // Draw fallback circle + letter
        ctx.fillStyle = "#e5e7eb";
        ctx.beginPath();
        ctx.arc(badgeX, badgeCenterY, badgeSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.font = "bold 28px Sans";
        ctx.textAlign = "center";
        ctx.fillText(getBadgeFallbackForRank(rankName), badgeX, badgeCenterY);
      }
    } else {
      ctx.fillStyle = "#e5e7eb";
      ctx.beginPath();
      ctx.arc(badgeX, badgeCenterY, badgeSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111827";
      ctx.font = "bold 28px Sans";
      ctx.textAlign = "center";
      ctx.fillText(getBadgeFallbackForRank(rankName), badgeX, badgeCenterY);
    }

    // Trainer name with gap after badge
    const nameX = badgeX + badgeSize / 2 + 24; // gap of 24px after badge
    const trainerMaxWidth =
      trainerColRight - nameX - trainerPadding;

    ctx.font = "bold 40px Sans";
    ctx.fillStyle = "#111827";
    fillTruncatedText(ctx, displayName, nameX, rowCenterY, trainerMaxWidth, "left");

    // --- Rank column ---
    ctx.textAlign = "center";
    ctx.font = "bold 38px Sans";
    ctx.fillStyle = "#111827";
    const rankMaxWidth = col3 - col2 - 40;
    fillTruncatedText(
      ctx,
      rankName,
      colRankCenterX,
      rowCenterY,
      rankMaxWidth,
      "center"
    );

    // --- Points ---
    ctx.textAlign = "center";
    ctx.font = "bold 40px Sans";
    ctx.fillStyle = "#b45309"; // amber-ish
    ctx.fillText(String(lifetimePoints), colPointsCenterX, rowCenterY);

    // --- Bounties ---
    ctx.fillStyle = "#2563eb"; // blue-600
    ctx.fillText(String(completedBounties), colBountiesCenterX, rowCenterY);
  }

  return canvas.toBuffer("image/png");
}

module.exports = {
  createLeaderboardCard
};
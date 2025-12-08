// renderers/leaderboardCard.cjs
//
// Renders a PNG leaderboard card with columns:
// # | Trainer | Rank (badge + name) | Points | Bounties
//
// - 4:3 aspect ratio: 2400 x 1800
// - Shows 10 players per page
//   page 1 → ranks #1–10
//   page 2 → ranks #11–20
// - Background image:
//     /renderers/leaderboard-bg/leaderboard-card.png
// - Each row is its own white card with red outline, with vertical
//   separator lines for the segments.
// - All text is black + bold.

const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

// 4:3
const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1800;
const PADDING = 80;

// Background image location (relative to this file)
const BG_PATH = path.join(__dirname, "leaderboard-bg", "leaderboard-card.png");

// Badge image folder: /renderers/rank-badges
const BADGE_DIR = path.join(__dirname, "rank-badges");

// Rank → badge filename mapping
const RANK_BADGE_FILES = {
  "Rookie Trainer": "poke-ball.png",
  Trainer: "great-ball.png",
  "Ace Trainer": "ultra-ball.png",
  "Gym Challenger": "premier-ball.png",
  "Gym Leader": "master-ball.png",
  "Elite Four": "beast-ball.png",
  Champion: "cherish-ball.png",
  Master: "vortex-ball.png"
};

// Simple text fallback if image missing
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
 * - Then discord username
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
 * Draw the background image, scaled to "cover" the canvas.
 */
async function drawBackground(ctx) {
  if (!fileExistsSafe(BG_PATH)) {
    // fallback: plain white
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    return;
  }

  const img = await loadImage(BG_PATH);
  const scale = Math.max(
    CARD_WIDTH / img.width,
    CARD_HEIGHT / img.height
  );

  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = (CARD_WIDTH - drawW) / 2;
  const dy = (CARD_HEIGHT - drawH) / 2;

  ctx.drawImage(img, dx, dy, drawW, drawH);
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

  // ---- Background ----
  await drawBackground(ctx);

  // ---- Title + page indicator ----
  const innerX = PADDING;
  const innerY = PADDING;
  const innerW = CARD_WIDTH - PADDING * 2;

  ctx.fillStyle = "#000000";
  ctx.font = "bold 80px Sans";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Top Hunters Leaderboard", innerX + 50, innerY + 40);

  // Page indicator (top-right)
  ctx.font = "bold 36px Sans";
  ctx.textAlign = "right";
  ctx.fillText(
    pageNum === 1 ? "Page 1 — Ranks #1–10" : "Page 2 — Ranks #11–20",
    innerX + innerW - 50,
    innerY + 55
  );

  // ---- Table / row geometry (for inner lines) ----
  const tableX = innerX + 40;
  const tableW = innerW - 80;

  // Column boundaries:
  // # | Trainer | Rank | Points | Bounties
  const col0 = tableX; // left border
  const col1 = tableX + 120; // after "#"
  const col2 = tableX + 980; // after Trainer
  const col3 = tableX + 1450; // after Rank
  const col4 = tableX + 1850; // after Points
  const col5 = tableX + tableW; // right border

  const colRankNumCenterX = (col0 + col1) / 2;
  const colTrainerCenterX = (col1 + col2) / 2;
  const colRankCenterX = (col2 + col3) / 2;
  const colPointsCenterX = (col3 + col4) / 2;
  const colBountiesCenterX = (col4 + col5) / 2;

  // Header labels (in free space above first row)
  const rowsTopY = innerY + 220; // first row top
  const headerCenterY = rowsTopY - 45;

  ctx.fillStyle = "#000000";
  ctx.font = "bold 46px Sans";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("#", colRankNumCenterX, headerCenterY);
  ctx.fillText("Trainer", colTrainerCenterX, headerCenterY);
  ctx.fillText("Rank", colRankCenterX, headerCenterY);
  ctx.fillText("Points", colPointsCenterX, headerCenterY);
  ctx.fillText("Bounties", colBountiesCenterX, headerCenterY);

  // ---- Fetch leaderboard data ----
  const allRows = await db.getLeaderboard(20);
  const startIndex = (pageNum - 1) * 10;
  const endIndex = startIndex + 10;
  const rows = allRows.slice(startIndex, endIndex);

  // ---- Row cards ----
  const rowHeight = 95;
  const rowGap = 15; // between row cards
  const rowRadius = 6;
  const rowBorderWidth = 4;
  const rowBorderColor = "#dc2626"; // red-600
  const colLineColor = "#e5e7eb"; // light gray for internal separators

  ctx.textBaseline = "middle";

  for (let i = 0; i < rows.length; i++) {
    const user = rows[i];
    const rowTopY = rowsTopY + i * (rowHeight + rowGap);
    const rowBottomY = rowTopY + rowHeight;
    const rowCenterY = rowTopY + rowHeight / 2;

    const globalRankNumber = startIndex + i + 1;
    const lifetimePoints = user.lifetime_points || 0;
    const completedBounties = user.completed_bounties || 0;
    const rankName = getRankName(lifetimePoints);

    // Display name (nickname)
    const displayName = await resolveDisplayName(guild, user);

    // --- Row card box (rounded white with red outline) ---
    ctx.save();
    drawRoundedRect(ctx, tableX, rowTopY, tableW, rowHeight, rowRadius);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = rowBorderWidth;
    ctx.strokeStyle = rowBorderColor;
    ctx.stroke();
    ctx.restore();

    // --- Internal vertical lines (segment separators) ---
    ctx.save();
    ctx.strokeStyle = colLineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    [col1, col2, col3, col4].forEach((x) => {
      ctx.moveTo(x, rowTopY);
      ctx.lineTo(x, rowBottomY);
    });
    ctx.stroke();
    ctx.restore();

    // --- Text styles ---
    ctx.fillStyle = "#000000";
    ctx.font = "bold 40px Sans";

    // --- # column ---
    ctx.textAlign = "center";
    ctx.fillText(`#${globalRankNumber}`, colRankNumCenterX, rowCenterY);

    // --- Trainer column ---
    ctx.textAlign = "center";
    const trainerMaxWidth = col2 - col1 - 40;
    fillTruncatedText(
      ctx,
      displayName,
      colTrainerCenterX,
      rowCenterY,
      trainerMaxWidth,
      "center"
    );

    // --- Rank column (badge + rank name) ---
    const rankColLeft = col2;
    const rankColRight = col3;
    const rankInnerPadding = 30;
    const badgeSize = 52;
    const badgeCenterY = rowCenterY;
    const badgeX = rankColLeft + rankInnerPadding + badgeSize / 2;

    const badgeFile = getBadgeFileForRank(rankName);
    const badgePath =
      badgeFile && fileExistsSafe(path.join(BADGE_DIR, badgeFile))
        ? path.join(BADGE_DIR, badgeFile)
        : null;

    if (badgePath) {
      try {
        const img = await loadImage(badgePath);
        const drawX = badgeX - badgeSize / 2;
        const drawY = badgeCenterY - badgeSize / 2;
        ctx.drawImage(img, drawX, drawY, badgeSize, badgeSize);
      } catch {
        // Fallback letter inside small circle
        ctx.fillStyle = "#e5e7eb";
        ctx.beginPath();
        ctx.arc(badgeX, badgeCenterY, badgeSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000000";
        ctx.font = "bold 28px Sans";
        ctx.textAlign = "center";
        ctx.fillText(getBadgeFallbackForRank(rankName), badgeX, badgeCenterY);
      }
    } else {
      // Fallback letter
      ctx.fillStyle = "#e5e7eb";
      ctx.beginPath();
      ctx.arc(badgeX, badgeCenterY, badgeSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000000";
      ctx.font = "bold 28px Sans";
      ctx.textAlign = "center";
      ctx.fillText(getBadgeFallbackForRank(rankName), badgeX, badgeCenterY);
    }

    // Rank name text to the right of badge
    const rankTextX = badgeX + badgeSize / 2 + 18;
    const rankMaxWidth = rankColRight - rankTextX - rankInnerPadding;

    ctx.textAlign = "left";
    ctx.font = "bold 38px Sans";
    ctx.fillStyle = "#000000";
    fillTruncatedText(ctx, rankName, rankTextX, rowCenterY, rankMaxWidth, "left");

    // --- Points ---
    ctx.textAlign = "center";
    ctx.font = "bold 40px Sans";
    ctx.fillStyle = "#000000";
    ctx.fillText(String(lifetimePoints), colPointsCenterX, rowCenterY);

    // --- Bounties ---
    ctx.fillText(String(completedBounties), colBountiesCenterX, rowCenterY);
  }

  return canvas.toBuffer("image/png");
}

module.exports = {
  createLeaderboardCard
};
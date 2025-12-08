// renderers/leaderboardCard.cjs
//
// FINAL LEADERBOARD (Top 10 Only) - Transparency - Balanced Spacing
//

const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1800;
const PADDING = 80;

const BG_PATH = path.join(__dirname, "leaderboard-bg", "leaderboard-card.png");

// transparency white
const PANEL_BG = "rgba(255,255,255,0.90)"; // 90% white
const BORDER_COLOR = "#dc2626";

const rowH = 120;
const rowGap = 18;
const radius = 10;
const strokeWidth = 4;

// Column layout adjustments (wider rank + bounties)
const colOffsets = {
  num: 165,        // # column width increased slightly
  trainer: 950,    // more room here
  rank: 1520,
  points: 1860,
  bounties: 2260
};

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

async function drawBackground(ctx) {
  if (!fs.existsSync(BG_PATH)) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    return;
  }

  const img = await loadImage(BG_PATH);
  const scale = Math.max(CARD_WIDTH / img.width, CARD_HEIGHT / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const dx = (CARD_WIDTH - w) / 2;
  const dy = (CARD_HEIGHT - h) / 2;

  ctx.drawImage(img, dx, dy, w, h);
}

function fillText(ctx, text, x, y, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  let truncated = text;
  while (truncated.length && ctx.measureText(truncated + "…").width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  ctx.fillText(truncated + "…", x, y);
}

async function resolveDisplayName(guild, row) {
  let name = row.username || "Unknown";
  try {
    let member = guild.members.cache.get(row.discord_id)
      || await guild.members.fetch(row.discord_id).catch(() => null);

    if (member) {
      return member.nickname ||
        member.user?.globalName ||
        member.user?.username ||
        name;
    }
  } catch {}

  return name;
}

async function createLeaderboardCard(guild) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  await drawBackground(ctx);

  //
  // Title
  //
  const title = "Top Hunters Leaderboard";
  ctx.font = "bold 92px Sans";
  const titleWidth = ctx.measureText(title).width + 220;
  const titleHeight = 130;
  const titleX = (CARD_WIDTH - titleWidth) / 2;
  const titleY = PADDING;

  ctx.save();
  drawRoundedRect(ctx, titleX, titleY, titleWidth, titleHeight, radius);
  ctx.fillStyle = PANEL_BG;
  ctx.fill();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = BORDER_COLOR;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, titleX + titleWidth / 2, titleY + titleHeight / 2);

  //
  // Column header card
  //
  const headerY = titleY + titleHeight + 45;
  const tableX = PADDING;
  const tableW = CARD_WIDTH - PADDING * 2;

  ctx.save();
  drawRoundedRect(ctx, tableX, headerY, tableW, rowH, radius);
  ctx.fillStyle = PANEL_BG;
  ctx.fill();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = BORDER_COLOR;
  ctx.stroke();
  ctx.restore();

  ctx.font = "bold 58px Sans";
  const headerCenterY = headerY + rowH / 2;

  ctx.fillStyle = "#000";
  ctx.fillText("#", tableX + colOffsets.num / 2, headerCenterY);
  ctx.fillText("Trainer", tableX + (colOffsets.num + colOffsets.trainer) / 2, headerCenterY);
  ctx.fillText("Rank", tableX + (colOffsets.trainer + colOffsets.rank) / 2, headerCenterY);
  ctx.fillText("Points", tableX + (colOffsets.rank + colOffsets.points) / 2, headerCenterY);
  ctx.fillText("Bounties", tableX + (colOffsets.points + colOffsets.bounties) / 2, headerCenterY);

  //
  // Rows
  //
  const rowsTop = headerY + rowH + 25;
  ctx.font = "bold 50px Sans";

  const list = await db.getLeaderboard(10);

  for (let i = 0; i < list.length; i++) {
    const user = list[i];

    const y = rowsTop + i * (rowH + rowGap);
    const cy = y + rowH / 2;

    // Draw card
    ctx.save();
    drawRoundedRect(ctx, tableX, y, tableW, rowH, radius);
    ctx.fillStyle = PANEL_BG;
    ctx.fill();
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = BORDER_COLOR;
    ctx.stroke();
    ctx.restore();

    const name = await resolveDisplayName(guild, user);
    const rankName = getRankName(user.lifetime_points);

    // # column
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.fillText(`#${i + 1}`, tableX + colOffsets.num / 2, cy);

    // Trainer name
    fillText(
      ctx,
      name,
      tableX + (colOffsets.num + colOffsets.trainer) / 2,
      cy,
      colOffsets.trainer - colOffsets.num - 50
    );

    // Rank text only (no icon)
    fillText(
      ctx,
      rankName,
      tableX + (colOffsets.trainer + colOffsets.rank) / 2,
      cy,
      colOffsets.rank - colOffsets.trainer - 60
    );

    // Points
    ctx.fillText(
      String(user.lifetime_points),
      tableX + (colOffsets.rank + colOffsets.points) / 2,
      cy
    );

    // Bounties
    ctx.fillText(
      String(user.completed_bounties),
      tableX + (colOffsets.points + colOffsets.bounties) / 2,
      cy
    );
  }

  return canvas.toBuffer("image/png");
}

module.exports = {
  createLeaderboardCard
};
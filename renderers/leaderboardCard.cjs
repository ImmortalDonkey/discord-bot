// renderers/leaderboardCard.cjs
// Top 10 leaderboard card

const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1800;
const PADDING = 80;

const BG_PATH = path.join(__dirname, "leaderboard-bg", "leaderboard-card.png");

function fileExistsSafe(fp) {
  try { return fs.existsSync(fp); } catch { return false; }
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

function applyTextStyle(ctx) {
  ctx.fillStyle = "#000000";    
  ctx.strokeStyle = "#ffffff";  
  ctx.lineWidth = 6;
  ctx.shadowColor = "transparent"; 
  ctx.shadowBlur = 0;
}

async function resolveDisplayName(guild, row) {
  try {
    const member = guild.members.cache.get(row.discord_id) ||
      await guild.members.fetch(row.discord_id).catch(() => null);

    if (member) {
      return member.nickname ||
        member.user?.globalName ||
        member.user?.username ||
        row.username;
    }
  } catch {}
  return row.username || "Unknown";
}

async function drawBackground(ctx) {
  const img = await loadImage(BG_PATH);
  const scale = Math.max(CARD_WIDTH / img.width, CARD_HEIGHT / img.height);
  ctx.drawImage(
    img,
    (CARD_WIDTH - img.width * scale) / 2,
    (CARD_HEIGHT - img.height * scale) / 2,
    img.width * scale,
    img.height * scale
  );
}

async function createLeaderboardCard(guild) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  await drawBackground(ctx);

  // Title
  const title = "Top Hunters Leaderboard";
  ctx.font = "bold 90px Sans";
  const titleW = ctx.measureText(title).width + 200;
  const titleH = 130;
  const titleX = (CARD_WIDTH - titleW) / 2;
  const titleY = PADDING;

  drawRoundedRect(ctx, titleX, titleY, titleW, titleH, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#dc2626";
  ctx.stroke();

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, titleX + titleW / 2, titleY + titleH / 2);

  // Table
  const tableX = PADDING;
  const tableW = CARD_WIDTH - PADDING * 2;
  const rowH = 120;
  const rowGap = 20;
  const radius = 8;
  const borderCol = "#dc2626";

  const headersY = titleY + titleH + 50;
  const firstRowY = headersY + rowH + rowGap;

  // Adjusted Trainer column width (shift columns right)
  const col0 = tableX;
  const col1 = tableX + 130; // slightly narrower
  const col2 = tableX + 950; // narrower for trainer name
  const col3 = tableX + 1540;
  const col4 = tableX + 1940;
  const col5 = tableX + tableW;

  const X = {
    pos: (col0 + col1) / 2,
    trainer: (col1 + col2) / 2,
    rank: (col2 + col3) / 2,
    points: (col3 + col4) / 2,
    bounties: (col4 + col5) / 2
  };

  // HEADER BOX opacity 0.25
  drawRoundedRect(ctx, tableX, headersY, tableW, rowH, radius);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = borderCol;
  ctx.stroke();

  // Header text (1px bigger)
  applyTextStyle(ctx);
  ctx.font = "bold 59px Sans";
  ctx.textAlign = "center";
  ctx.strokeText("Trainer", X.trainer, headersY + rowH / 2);
  ctx.fillText("Trainer", X.trainer, headersY + rowH / 2);
  ctx.strokeText("Rank", X.rank, headersY + rowH / 2);
  ctx.fillText("Rank", X.rank, headersY + rowH / 2);
  ctx.strokeText("Points", X.points, headersY + rowH / 2);
  ctx.fillText("Points", X.points, headersY + rowH / 2);
  ctx.strokeText("Bounties", X.bounties, headersY + rowH / 2);
  ctx.fillText("Bounties", X.bounties, headersY + rowH / 2);

  // Rows
  const rows = await db.getLeaderboard(10);
  ctx.font = "bold 53px Sans"; // 1px bigger

  for (let i = 0; i < rows.length; i++) {
    const y = firstRowY + i * (rowH + rowGap);
    const center = y + rowH / 2;

    drawRoundedRect(ctx, tableX, y, tableW, rowH, radius);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = borderCol;
    ctx.stroke();

    const user = rows[i];
    const name = await resolveDisplayName(guild, user);
    const rName = getRankName(user.lifetime_points);

    applyTextStyle(ctx);

    ctx.textAlign = "center";
    ctx.strokeText(`#${i + 1}`, X.pos, center);
    ctx.fillText(`#${i + 1}`, X.pos, center);

    ctx.strokeText(name, X.trainer, center);
    ctx.fillText(name, X.trainer, center);

    ctx.strokeText(rName, X.rank, center);
    ctx.fillText(rName, X.rank, center);

    ctx.strokeText(String(user.lifetime_points), X.points, center);
    ctx.fillText(String(user.lifetime_points), X.points, center);

    ctx.strokeText(String(user.completed_bounties), X.bounties, center);
    ctx.fillText(String(user.completed_bounties), X.bounties, center);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
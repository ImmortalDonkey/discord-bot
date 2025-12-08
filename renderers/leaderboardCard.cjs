// renderers/leaderboardCard.cjs
//
// Shows Top 10 only
// Transparent header + row cards with red outline
// Text has a 6px black stroke for visibility
// Title remains solid white
// Background: /renderers/leaderboard-bg/leaderboard-card.png

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

function strokeText(ctx, text, x, y) {
  ctx.textAlign = ctx.textAlign;
  ctx.textBaseline = ctx.textBaseline;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

async function resolveDisplayName(guild, row) {
  try {
    let member = guild.members.cache.get(row.discord_id) ||
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
  if (!fileExistsSafe(BG_PATH)) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    return;
  }
  const img = await loadImage(BG_PATH);
  const scale = Math.max(CARD_WIDTH / img.width, CARD_HEIGHT / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, (CARD_WIDTH - drawW) / 2, (CARD_HEIGHT - drawH) / 2, drawW, drawH);
}

async function createLeaderboardCard(guild) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  await drawBackground(ctx);

  // Title card
  const title = "Top Hunters Leaderboard";
  ctx.font = "bold 90px Sans";
  const titleW = ctx.measureText(title).width + 200;
  const titleH = 130;
  const titleX = (CARD_WIDTH - titleW) / 2;
  const titleY = PADDING;

  drawRoundedRect(ctx, titleX, titleY, titleW, titleH, 10);
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = "#dc2626"; ctx.stroke();

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, titleX + titleW / 2, titleY + titleH / 2);

  // Table geometry
  const tableX = PADDING;
  const tableW = CARD_WIDTH - PADDING * 2;
  const rowH = 120;
  const rowGap = 20;
  const radius = 8;
  const borderCol = "#dc2626";

  const headersY = titleY + titleH + 50;
  const firstRowY = headersY + rowH + rowGap;

  // Columns
  const col0 = tableX;
  const col1 = tableX + 140;
  const col2 = tableX + 1020;
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

  // Transparent header card
  drawRoundedRect(ctx, tableX, headersY, tableW, rowH, radius);
  ctx.lineWidth = 4; ctx.strokeStyle = borderCol; ctx.stroke();

  ctx.font = "bold 58px Sans";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 6;
  ctx.fillStyle = "#ffffff";

  ctx.textBaseline = "middle";

  strokeText(ctx, "Trainer", X.trainer, headersY + rowH / 2);
  strokeText(ctx, "Rank",    X.rank, headersY + rowH / 2);
  strokeText(ctx, "Points",  X.points, headersY + rowH / 2);
  strokeText(ctx, "Bounties",X.bounties, headersY + rowH / 2);

  // Data
  const list = await db.getLeaderboard(10);
  ctx.font = "bold 52px Sans";

  for (let i = 0; i < list.length; i++) {
    const user = list[i];
    const y = firstRowY + i * (rowH + rowGap);
    const center = y + rowH / 2;
    const name = await resolveDisplayName(guild, user);
    const rankText = getRankName(user.lifetime_points);

    // Row card with transparency
    drawRoundedRect(ctx, tableX, y, tableW, rowH, radius);
    ctx.fillStyle = "rgba(255,255,255,0.55)"; // **increased transparency**
    ctx.fill();
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000";

    strokeText(ctx, `#${i + 1}`, X.pos, center);
    strokeText(ctx, name, X.trainer, center);
    strokeText(ctx, rankText, X.rank, center);
    strokeText(ctx, String(user.lifetime_points), X.points, center);
    strokeText(ctx, String(user.completed_bounties), X.bounties, center);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
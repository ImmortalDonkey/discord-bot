// renderers/leaderboardCard.cjs
//
// Top 10 leaderboard card
// Title card = solid white
// Table header + rows = semi-transparent (0.35 opacity)
// Table text = black with bold white outline

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

// Style for table/header text: white outline + black fill
function applyTextStyle(ctx) {
  ctx.fillStyle = "#000000";      // black fill
  ctx.strokeStyle = "#ffffff";    // white outline
  ctx.lineWidth = 6;              // bold outline
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
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
  if (!fileExistsSafe(BG_PATH)) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    return;
  }
  const img = await loadImage(BG_PATH);
  const scale = Math.max(CARD_WIDTH / img.width, CARD_HEIGHT / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(
    img,
    (CARD_WIDTH - drawW) / 2,
    (CARD_HEIGHT - drawH) / 2,
    drawW,
    drawH
  );
}

async function createLeaderboardCard(guild) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  await drawBackground(ctx);

  // ---- Title (solid white background, no outline on text) ----
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

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#000000";
  ctx.fillText(title, titleX + titleW / 2, titleY + titleH / 2);

  // ---- Table geometry ----
  const tableX = PADDING;
  const tableW = CARD_WIDTH - PADDING * 2;
  const rowH = 120;
  const rowGap = 20;
  const radius = 8;
  const borderCol = "#dc2626";

  const headersY = titleY + titleH + 50;
  const firstRowY = headersY + rowH + rowGap;

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

  // ---- Header row (0.35 opacity) ----
  drawRoundedRect(ctx, tableX, headersY, tableW, rowH, radius);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = borderCol;
  ctx.stroke();

  applyTextStyle(ctx);
  ctx.font = "bold 58px Sans";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Position column header intentionally blank
  ctx.strokeText("", X.pos, headersY + rowH / 2);
  ctx.fillText("", X.pos, headersY + rowH / 2);

  ctx.strokeText("Trainer", X.trainer, headersY + rowH / 2);
  ctx.fillText("Trainer", X.trainer, headersY + rowH / 2);

  ctx.strokeText("Rank", X.rank, headersY + rowH / 2);
  ctx.fillText("Rank", X.rank, headersY + rowH / 2);

  ctx.strokeText("Points", X.points, headersY + rowH / 2);
  ctx.fillText("Points", X.points, headersY + rowH / 2);

  ctx.strokeText("Bounties", X.bounties, headersY + rowH / 2);
  ctx.fillText("Bounties", X.bounties, headersY + rowH / 2);

  // ---- Data rows ----
  const rows = await db.getLeaderboard(10);
  ctx.font = "bold 52px Sans";

  for (let i = 0; i < rows.length; i++) {
    const user = rows[i];
    const y = firstRowY + i * (rowH + rowGap);
    const center = y + rowH / 2;

    const name = await resolveDisplayName(guild, user);
    const rankText = getRankName(user.lifetime_points);

    // Row background (0.35 opacity)
    drawRoundedRect(ctx, tableX, y, tableW, rowH, radius);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = borderCol;
    ctx.stroke();

    applyTextStyle(ctx);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Position
    ctx.strokeText(`#${i + 1}`, X.pos, center);
    ctx.fillText(`#${i + 1}`, X.pos, center);

    // Trainer
    ctx.strokeText(name, X.trainer, center);
    ctx.fillText(name, X.trainer, center);

    // Rank
    ctx.strokeText(rankText, X.rank, center);
    ctx.fillText(rankText, X.rank, center);

    // Points
    const pointsStr = String(user.lifetime_points);
    ctx.strokeText(pointsStr, X.points, center);
    ctx.fillText(pointsStr, X.points, center);

    // Bounties
    const bountiesStr = String(user.completed_bounties);
    ctx.strokeText(bountiesStr, X.bounties, center);
    ctx.fillText(bountiesStr, X.bounties, center);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
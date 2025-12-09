// renderers/leaderboardCard.cjs
//
// Final Tweaked Version + Latest Bounties Width Fix
//  - Transparent row + header cards (25% opacity)
//  - Solid white title card
//  - Trainer narrowed further / Bounties widened further
//  - Rank and Points untouched
//  - +2px font improvements
//  - Auto text truncation
//  - No glow

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
  if (!fileExistsSafe(BG_PATH)) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    return;
  }
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

function fillTruncatedText(ctx, text, x, y, maxWidth) {
  const full = String(text || "");
  if (ctx.measureText(full).width <= maxWidth) {
    ctx.fillText(full, x, y);
    return;
  }
  let trimmed = full;
  while (trimmed.length && ctx.measureText(trimmed + "…").width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  ctx.fillText(trimmed + "…", x, y);
}

async function resolveDisplayName(guild, row) {
  try {
    const m = guild.members.cache.get(row.discord_id) ||
      await guild.members.fetch(row.discord_id).catch(() => null);
    if (m) return m.nickname || m.user?.globalName || m.user?.username;
  } catch {}
  return row.username || "Unknown";
}

async function createLeaderboardCard(guild) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  await drawBackground(ctx);

  // Title
  const title = "Top Hunters Leaderboard";
  ctx.font = "bold 90px Sans";
  const tW = ctx.measureText(title).width + 200;
  const tH = 130;
  const tX = (CARD_WIDTH - tW) / 2;
  const tY = PADDING;

  drawRoundedRect(ctx, tX, tY, tW, tH, 10);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#dc2626";
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, tX + tW / 2, tY + tH / 2);

  // Table geometry
  const tableX = PADDING;
  const tableW = CARD_WIDTH - PADDING * 2;
  const rowH = 120;
  const rowGap = 20;
  const headerY = tY + tH + 50;
  const firstRowY = headerY + rowH + rowGap;

  // COLUMN WIDTH REVISIONS
  const col0 = tableX;
  const col1 = tableX + 140;
  const col2 = tableX + 920;   // -(50) further reduced Trainer width
  const col3 = tableX + 1570;  // unchanged Rank width increase
  const col4 = tableX + 2010;  // +(50) more Bounties width
  const col5 = tableX + tableW;

  const X = {
    rank: (col0 + col1) / 2,
    trainer: (col1 + col2) / 2,
    rankInfo: (col2 + col3) / 2,
    points: (col3 + col4) / 2,
    bounties: (col4 + col5) / 2
  };

  // Header row
  ctx.save();
  ctx.globalAlpha = 0.25;
  drawRoundedRect(ctx, tableX, headerY, tableW, rowH, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#000";
  ctx.font = "bold 60px Sans";
  ctx.fillText("Trainer", X.trainer, headerY + rowH / 2);
  ctx.fillText("Rank", X.rankInfo, headerY + rowH / 2);
  ctx.fillText("Points", X.points, headerY + rowH / 2);
  ctx.fillText("Bounties", X.bounties, headerY + rowH / 2);

  const list = await db.getLeaderboard(10);
  ctx.font = "bold 54px Sans";

  for (let i = 0; i < list.length; i++) {
    const usr = list[i];
    const y = firstRowY + i * (rowH + rowGap);
    const cy = y + rowH / 2;
    const name = await resolveDisplayName(guild, usr);
    const rankName = getRankName(usr.lifetime_points);
    const lifetime = usr.lifetime_points || 0;
    const completed = usr.completed_bounties || 0;

    // Row background
    ctx.save();
    ctx.globalAlpha = 0.25;
    drawRoundedRect(ctx, tableX, y, tableW, rowH, 8);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#000";
    ctx.textAlign = "center";

    ctx.fillText(`#${i+1}`, X.rank, cy);
    fillTruncatedText(ctx, name, X.trainer, cy, col2 - col1 - 50);

    fillTruncatedText(ctx, rankName, X.rankInfo, cy, col3 - col2 - 90);
    ctx.fillText(String(lifetime), X.points, cy);
    ctx.fillText(String(completed), X.bounties, cy);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
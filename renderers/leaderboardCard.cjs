// renderers/leaderboardCard.cjs
//
// Final Tweaked Version
//  - Transparent row + header cards (25% opacity)
//  - Solid white title card
//  - Trainer col narrower / Bounties wider
//  - +2px text increase
//  - Auto text truncation
//  - No glow

const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

// 4:3 resolution
const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1800;
const PADDING = 80;

// background path
const BG_PATH = path.join(__dirname, "leaderboard-bg", "leaderboard-card.png");

// rank badges
const BADGE_DIR = path.join(__dirname, "rank-badges");
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
  let name = row.username || "Unknown";
  try {
    let m = guild.members.cache.get(row.discord_id) ||
            await guild.members.fetch(row.discord_id).catch(() => null);
    if (m) {
      return m.nickname ||
             m.user?.globalName ||
             m.user?.username ||
             name;
    }
  } catch {}
  return name;
}

async function drawBackground(ctx) {
  if (!fileExistsSafe(BG_PATH)) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    return;
  }
  const img = await loadImage(BG_PATH);
  const scale = Math.max(
    CARD_WIDTH / img.width,
    CARD_HEIGHT / img.height
  );
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (CARD_WIDTH - w) / 2, (CARD_HEIGHT - h) / 2, w, h);
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

  ctx.save();
  drawRoundedRect(ctx, titleX, titleY, titleW, titleH, 10);
  ctx.fillStyle = "#ffffff"; // solid white
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#dc2626";
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, titleX + titleW / 2, titleY + titleH / 2);

  // table geometry
  const tableX = PADDING;
  const tableW = CARD_WIDTH - (PADDING * 2);
  const rowH = 120;
  const rowGap = 20;

  const headersY = titleY + titleH + 50;
  const firstRowY = headersY + rowH + rowGap;

  // column layout adjusted
  const col0 = tableX;
  const col1 = tableX + 140;
  const col2 = tableX + 970;  // trainer narrower  (was 1020)
  const col3 = tableX + 1540;
  const col4 = tableX + 1990; // bounties wider  (was 1940)
  const col5 = tableX + tableW;

  const X = {
    rank: (col0 + col1) / 2,
    trainer: (col1 + col2) / 2,
    rankInfo: (col2 + col3) / 2,
    points: (col3 + col4) / 2,
    bounties: (col4 + col5) / 2
  };

  // header card (transparent 25%)
  ctx.save();
  ctx.globalAlpha = 0.25;
  drawRoundedRect(ctx, tableX, headersY, tableW, rowH, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // header text
  ctx.fillStyle = "#000";
  ctx.font = "bold 60px Sans";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("Trainer", X.trainer, headersY + rowH / 2);
  ctx.fillText("Rank", X.rankInfo, headersY + rowH / 2);
  ctx.fillText("Points", X.points, headersY + rowH / 2);
  ctx.fillText("Bounties", X.bounties, headersY + rowH / 2);

  // data
  const list = await db.getLeaderboard(10);
  ctx.font = "bold 54px Sans"; // increased 2px

  for (let i = 0; i < list.length; i++) {
    const usr = list[i];
    const y = firstRowY + i * (rowH + rowGap);
    const cy = y + rowH / 2;
    const name = await resolveDisplayName(guild, usr);
    const rankName = getRankName(usr.lifetime_points);
    const lifetime = usr.lifetime_points || 0;
    const completed = usr.completed_bounties || 0;

    // row card transparent 25%
    ctx.save();
    ctx.globalAlpha = 0.25;
    drawRoundedRect(ctx, tableX, y, tableW, rowH, 8);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#000";
    ctx.textAlign = "center";

    // #
    ctx.fillText(`#${i + 1}`, X.rank, cy);

    // trainer name (truncate)
    fillTruncatedText(ctx, name, X.trainer, cy, col2 - col1 - 50);

    // rank text auto-fit
    const rankMax = col3 - col2 - 120;
    fillTruncatedText(ctx, rankName, X.rankInfo, cy, rankMax);

    // points
    ctx.fillText(String(lifetime), X.points, cy);

    // bounties
    ctx.fillText(String(completed), X.bounties, cy);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
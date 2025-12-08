// renderers/leaderboardCard.cjs
//
// FINAL VERSION with:
//  - Header row as a card
  - Wider Rank & Bounties columns (no clipping)
//  - Slightly narrower Trainer + #
//  - Increased inner padding
//  - Transparent cards (see background)
//  - Top 10 only (no page logic)

const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

// 4:3 resolution
const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1800;
const PADDING = 80; // outer margin

// Background
const BG_PATH = path.join(__dirname, "leaderboard-bg", "leaderboard-card.png");

// Badge Icons
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

function fillTruncatedText(ctx, text, x, y, maxWidth, align = "center") {
  const full = String(text || "");
  if (ctx.measureText(full).width <= maxWidth) {
    ctx.textAlign = align;
    ctx.fillText(full, x, y);
    return;
  }
  let trimmed = full;
  while (trimmed.length && ctx.measureText(trimmed + "…").width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  ctx.textAlign = align;
  ctx.fillText(trimmed + "…", x, y);
}

async function resolveDisplayName(guild, row) {
  let name = row.username || "Unknown";
  try {
    let member = guild.members.cache.get(row.discord_id) ||
      await guild.members.fetch(row.discord_id).catch(() => null);

    if (member) {
      return member.nickname ||
             member.user?.globalName ||
             member.user?.username ||
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
  const scale = Math.max(CARD_WIDTH / img.width, CARD_HEIGHT / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, (CARD_WIDTH - drawW) / 2, (CARD_HEIGHT - drawH) / 2, drawW, drawH);
}

async function createLeaderboardCard(guild) {

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  await drawBackground(ctx);

  // Title Card
  const title = "Top Hunters Leaderboard";
  ctx.font = "bold 90px Sans";
  const titleW = ctx.measureText(title).width + 200;
  const titleH = 130;
  const titleX = (CARD_WIDTH - titleW) / 2;
  const titleY = PADDING;

  ctx.save();
  drawRoundedRect(ctx, titleX, titleY, titleW, titleH, 10);
  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#dc2626";
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, titleX + titleW / 2, titleY + titleH / 2);

  // Table positioning
  const tableX = PADDING;
  const tableW = CARD_WIDTH - (PADDING * 2);
  const rowH = 120;
  const rowGap = 20;
  const radius = 8;
  const borderCol = "#dc2626";

  const headersY = titleY + titleH + 55; // nudged down slightly
  const firstRowY = headersY + rowH + rowGap;

  // UPDATED COLUMN WIDTHS
  const col0 = tableX;
  const col1 = tableX + 120;   // narrower #
  const col2 = tableX + 950;   // narrower Trainer
  const col3 = tableX + 1620;  // wider Rank
  const col4 = tableX + 2000;  // wider Points
  const col5 = tableX + tableW;// wider Bounties

  // Column centers
  const X = {
    rank: (col0 + col1) / 2,
    trainer: (col1 + col2) / 2,
    rankInfo: (col2 + col3) / 2,
    points: (col3 + col4) / 2,
    bounties: (col4 + col5) / 2
  };

  // HEADER CARD
  ctx.save();
  drawRoundedRect(ctx, tableX, headersY, tableW, rowH, radius);
  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = borderCol; ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#000000";
  ctx.font = "bold 60px Sans";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText("#", X.rank, headersY + rowH / 2);
  ctx.fillText("Trainer", X.trainer, headersY + rowH / 2);
  ctx.fillText("Rank", X.rankInfo, headersY + rowH / 2);
  ctx.fillText("Points", X.points, headersY + rowH / 2);
  ctx.fillText("Bounties", X.bounties, headersY + rowH / 2);

  // DATA ROWS
  const list = await db.getLeaderboard(10);

  ctx.font = "bold 52px Sans";

  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    const y = firstRowY + i * (rowH + rowGap);
    const center = y + rowH / 2;

    const name = await resolveDisplayName(guild, u);
    const rankName = getRankName(u.lifetime_points);

    ctx.save();
    drawRoundedRect(ctx, tableX, y, tableW, rowH, radius);
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = borderCol;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#000000";

    ctx.textAlign = "center";
    ctx.fillText(`#${i + 1}`, X.rank, center);

    fillTruncatedText(ctx, name, X.trainer, center, col2 - col1 - 60);

    const badgeSize = 62;
    const badgeX = X.rankInfo - 70;
    const badgeFile = RANK_BADGE_FILES[rankName];
    if (badgeFile) {
      const p = path.join(BADGE_DIR, badgeFile);
      if (fileExistsSafe(p)) {
        try {
          const img = await loadImage(p);
          ctx.drawImage(img, badgeX - badgeSize / 2, center - badgeSize / 2, badgeSize, badgeSize);
        } catch {}
      }
    }

    fillTruncatedText(ctx, rankName, X.rankInfo + 40, center, col3 - col2 - 140);

    ctx.fillText(String(u.lifetime_points), X.points, center);
    ctx.fillText(String(u.completed_bounties), X.bounties, center);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
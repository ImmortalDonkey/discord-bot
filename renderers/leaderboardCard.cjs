// renderers/leaderboardCard.cjs
//
// FINAL VERSION — Header row in card, equal spacing, no page logic
//
// Shows Top 10 only
// White cards w/red outline for title + header + rows
// Background: /renderers/leaderboard-bg/leaderboard-card.png

const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

// 4:3 resolution
const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1800;
const PADDING = 80; // margin around entire design

// Background location
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
                 await guild.members.fetch(row.discord_id).catch(()=>null);

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

  // Title card
  const title = "Top Hunters Leaderboard";
  ctx.font = "bold 90px Sans";
  const titleW = ctx.measureText(title).width + 200;
  const titleH = 130;
  const titleX = (CARD_WIDTH - titleW) / 2;
  const titleY = PADDING;

  ctx.save();
  drawRoundedRect(ctx, titleX, titleY, titleW, titleH, 10);
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = "#dc2626"; ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#000"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(title, titleX + titleW / 2, titleY + titleH / 2);

  // Table geometry
  const tableX = PADDING;
  const tableW = CARD_WIDTH - (PADDING * 2);
  const rowH = 120;
  const rowGap = 20;
  const radius = 8;
  const borderCol = "#dc2626";

  const headersY = titleY + titleH + 50;
  const firstRowY = headersY + rowH + rowGap;

  // Column offsets
  const col0 = tableX;
  const col1 = tableX + 140;
  const col2 = tableX + 1020;
  const col3 = tableX + 1540;
  const col4 = tableX + 1940;
  const col5 = tableX + tableW;

  const X = {
    rank: (col0 + col1) / 2,
    trainer: (col1 + col2) / 2,
    rankInfo: (col2 + col3) / 2,
    points: (col3 + col4) / 2,
    bounties: (col4 + col5) / 2
  };

  // HEADER ROW card
  ctx.save();
  drawRoundedRect(ctx, tableX, headersY, tableW, rowH, radius);
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = borderCol; ctx.stroke();
  ctx.restore();

  // Header text
  ctx.fillStyle = "#000"; ctx.font = "bold 58px Sans"; ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("#", X.rank, headersY + rowH / 2);
  ctx.fillText("Trainer", X.trainer, headersY + rowH / 2);
  ctx.fillText("Rank", X.rankInfo, headersY + rowH / 2);
  ctx.fillText("Points", X.points, headersY + rowH / 2);
  ctx.fillText("Bounties", X.bounties, headersY + rowH / 2);

  // Leaderboard data
  const list = await db.getLeaderboard(10);

  ctx.font = "bold 52px Sans";

  for (let i = 0; i < list.length; i++) {
    const user = list[i];
    const y = firstRowY + i * (rowH + rowGap);
    const center = y + rowH / 2;

    const name = await resolveDisplayName(guild, user);
    const rankName = getRankName(user.lifetime_points);

    // box
    ctx.save();
    drawRoundedRect(ctx, tableX, y, tableW, rowH, radius);
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = borderCol; ctx.stroke();
    ctx.restore();

    // text
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.fillText(`#${i+1}`, X.rank, center);
    fillTruncatedText(ctx, name, X.trainer, center, col2-col1-40);

    // Rank + badge
    const badgeSize = 62;
    const badgeX = X.rankInfo - 80;
    const badgeFile = RANK_BADGE_FILES[rankName];
    const badgePath = badgeFile && fileExistsSafe(path.join(BADGE_DIR, badgeFile))
      ? path.join(BADGE_DIR, badgeFile) : null;

    if (badgePath) {
      try {
        const img = await loadImage(badgePath);
        ctx.drawImage(img, badgeX - badgeSize/2, center - badgeSize/2, badgeSize, badgeSize);
      } catch {}
    }

    fillTruncatedText(ctx, rankName, X.rankInfo + 60, center, col3-col2-120);

    ctx.fillText(String(user.lifetime_points), X.points, center);
    ctx.fillText(String(user.completed_bounties), X.bounties, center);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
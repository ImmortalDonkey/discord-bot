// renderers/leaderboardCard.cjs
//
// FINAL VERSION — Top 10 only, centered title card,
// header card matches row style, transparency added

const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1800;
const PADDING = 80;

// Paths
const BG_PATH = path.join(__dirname, "leaderboard-bg", "leaderboard-card.png");
const BADGE_DIR = path.join(__dirname, "rank-badges");

// Badge icon lookup
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

// Utility
function fileExistsSafe(fp) {
  try { return fs.existsSync(fp); } catch { return false; }
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

function fillTruncatedText(ctx, text, x, y, maxWidth, align="center") {
  const full = String(text || "");
  ctx.textAlign = align;
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

async function resolveDisplayName(guild, userRow) {
  let def = userRow.username || "Unknown";
  if (!guild || !userRow.discord_id) return def;

  try {
    let member = guild.members.cache.get(userRow.discord_id) ||
      await guild.members.fetch(userRow.discord_id).catch(()=>null);

    if (member) {
      return member.nickname ||
             member.user?.globalName ||
             member.user?.username ||
             def;
    }
  } catch {}
  return def;
}

async function drawBackground(ctx) {
  if (!fileExistsSafe(BG_PATH)) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    return;
  }
  const img = await loadImage(BG_PATH);
  const scale = Math.max(CARD_WIDTH/img.width, CARD_HEIGHT/img.height);
  ctx.drawImage(
    img,
    (CARD_WIDTH - img.width*scale)/2,
    (CARD_HEIGHT - img.height*scale)/2,
    img.width*scale,
    img.height*scale
  );
}

async function createLeaderboardCard(guild) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  await drawBackground(ctx);

  //
  // Title
  //
  const title = "Top Hunters Leaderboard";
  ctx.font = "bold 94px Sans";
  const titleW = ctx.measureText(title).width + 200;
  const titleH = 140;
  const titleX = (CARD_WIDTH - titleW)/2;
  const titleY = PADDING;

  ctx.save();
  drawRoundedRect(ctx, titleX, titleY, titleW, titleH, 12);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#dc2626";
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, titleX + titleW/2, titleY + titleH/2);

  //
  // Table area
  //
  const tableX = PADDING;
  const tableW = CARD_WIDTH - PADDING*2;
  const rowH = 125;
  const rowGap = 22;
  const radius = 10;
  const borderCol = "#dc2626";

  const headerY = titleY + titleH + 65;
  const rowsY = headerY + rowH + rowGap;

  // Improved Column Layout 🌟
  const col0 = tableX;
  const col1 = tableX + 120;    // # column slightly narrower
  const col2 = tableX + 950;    // Trainer slightly narrower
  const col3 = tableX + 1620;   // Rank wider
  const col4 = tableX + 2030;   // Points slightly wider
  const col5 = tableX + tableW; // Bounties wider

  const X = {
    rank: (col0 + col1)/2,
    trainer: (col1 + col2)/2,
    rankInfo: (col2 + col3)/2,
    points: (col3 + col4)/2,
    bounties: (col4 + col5)/2
  };

  //
  // Header Row Card
  //
  ctx.save();
  drawRoundedRect(ctx, tableX, headerY, tableW, rowH, radius);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = borderCol;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#000";
  ctx.font = "bold 62px Sans";
  ctx.fillText("#", X.rank, headerY + rowH/2);
  ctx.fillText("Trainer", X.trainer, headerY + rowH/2);
  ctx.fillText("Rank", X.rankInfo, headerY + rowH/2);
  ctx.fillText("Points", X.points, headerY + rowH/2);
  ctx.fillText("Bounties", X.bounties, headerY + rowH/2);

  //
  // Row Cards (Top 10 only)
  //
  const list = await db.getLeaderboard(10);
  ctx.font = "bold 56px Sans";

  for (let i = 0; i < list.length; i++) {
    const user = list[i];
    const y = rowsY + i*(rowH + rowGap);
    const center = y + rowH/2;

    const displayName = await resolveDisplayName(guild, user);
    const rankName = getRankName(user.lifetime_points);

    // Row card
    ctx.save();
    drawRoundedRect(ctx, tableX, y, tableW, rowH, radius);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = borderCol;
    ctx.stroke();
    ctx.restore();

    // # Column
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.fillText(`#${i+1}`, X.rank, center);

    // Trainer text
    const trainerMax = col2 - col1 - 70;
    fillTruncatedText(ctx, displayName, X.trainer, center, trainerMax);

    // Rank badge + name
    const badgeSize = 62;
    const badgeX = X.rankInfo - 70;
    const badgeFile = RANK_BADGE_FILES[rankName];
    const badgePath = badgeFile && fileExistsSafe(path.join(BADGE_DIR, badgeFile))
      ? path.join(BADGE_DIR, badgeFile)
      : null;

    if (badgePath) {
      try {
        const img = await loadImage(badgePath);
        ctx.drawImage(img, badgeX - badgeSize/2, center - badgeSize/2, badgeSize, badgeSize);
      } catch {}
    } else {
      // fallback drawn badge
      ctx.fillStyle = "#e5e7eb";
      ctx.beginPath();
      ctx.arc(badgeX, center, badgeSize/2, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.font = "bold 34px Sans";
      ctx.fillText(RANK_BADGE_FALLBACK[rankName], badgeX, center);
    }

    const rankMax = col3 - col2 - 150;
    fillTruncatedText(ctx, rankName, X.rankInfo + 55, center, rankMax);

    // Points + Bounties
    ctx.font = "bold 56px Sans";
    ctx.fillText(String(user.lifetime_points), X.points, center);
    ctx.fillText(String(user.completed_bounties), X.bounties, center);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
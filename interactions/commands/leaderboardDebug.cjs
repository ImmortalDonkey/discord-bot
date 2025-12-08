// renderers/leaderboardCard.cjs
//
// Top Hunters leaderboard renderer
// - Always Top 10 only
// - Title + Header + Rows each have their own styled box
// - Background image support
// - Rank badges centered inside column

const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const db = require("../database.cjs");
const { getRankName } = require("../utils/rankSystem.cjs");

const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1800;
const PADDING = 80;

const BG_PATH = path.join(__dirname, "leaderboard-bg", "leaderboard-card.png");
const BADGE_DIR = path.join(__dirname, "rank-badges");
const BADGE_SIZE = 60;

// Rank badge image mapping
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

// Badge fallback letters
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
function fileExistsSafe(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

// Style constants
const BOX_STROKE = 4;
const BOX_RADIUS = 8;
const BOX_GAP = 24;

const TITLE_FONT = "bold 92px Sans";
const HEADER_FONT = "bold 56px Sans";
const ROW_FONT = "bold 50px Sans";
const ROW_HEIGHT = 125;

// Rounded rectangle draw
function drawRounded(ctx, x, y, w, h) {
  const r = BOX_RADIUS;
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

// Truncate text
function text(ctx, txt, x, y, width, align="center") {
  ctx.textAlign = align;
  if (ctx.measureText(txt).width <= width) {
    ctx.fillText(txt, x, y);
    return;
  }
  while (txt.length > 0 && ctx.measureText(txt + "…").width > width) {
    txt = txt.slice(0,-1);
  }
  ctx.fillText(txt + "…", x, y);
}

// Background draw
async function drawBackground(ctx) {
  if (!fileExistsSafe(BG_PATH)) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,CARD_WIDTH,CARD_HEIGHT);
    return;
  }
  const img = await loadImage(BG_PATH);
  const scale = Math.max(CARD_WIDTH/img.width, CARD_HEIGHT/img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (CARD_WIDTH-w)/2, (CARD_HEIGHT-h)/2, w, h);
}

async function createLeaderboardCard(guild) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  await drawBackground(ctx);

  // === TITLE BOX ===
  const title = "Top Hunters Leaderboard";
  ctx.font = TITLE_FONT;
  const tw = ctx.measureText(title).width;
  const titleW = tw + 200;
  const titleH = 120;
  const titleX = (CARD_WIDTH - titleW) / 2;
  const titleY = PADDING;

  ctx.save();
  drawRounded(ctx, titleX, titleY, titleW, titleH);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = BOX_STROKE;
  ctx.strokeStyle = "#dc2626";
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, titleX + titleW/2, titleY + titleH/2);

  // === Fetch Top 10 ===
  const rows = (await db.getLeaderboard(10)).slice(0, 10);

  const tableX = PADDING;
  const tableW = CARD_WIDTH - PADDING*2;

  const startY = titleY + titleH + 70;

  // COLUMN SPLITS
  const col0 = tableX;
  const col1 = tableX + 140;
  const col2 = tableX + 1040;
  const col3 = tableX + 1560;
  const col4 = tableX + 1980;
  const col5 = tableX + tableW;

  const cx = {
    num: (col0+col1)/2,
    trainer: (col1+col2)/2,
    rank: (col2+col3)/2,
    points: (col3+col4)/2,
    bounties: (col4+col5)/2
  };

  // === HEADER ROW ===
  const headers = ["#", "Trainer", "Rank", "Points", "Bounties"];
  const headerY = startY;
  const headerH = 100;

  for (let i=0;i<5;i++) {
    const sx = [col0,col1,col2,col3,col4][i];
    const ex = [col1,col2,col3,col4,col5][i];
    const w = ex - sx;

    ctx.save();
    drawRounded(ctx, sx, headerY, w, headerH);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = BOX_STROKE;
    ctx.stroke();
    ctx.restore();

    ctx.font = HEADER_FONT;
    ctx.fillStyle = "#000";
    text(ctx, headers[i], (sx+ex)/2, headerY + headerH/2, w-20, "center");
  }

  let rowY = headerY + headerH + BOX_GAP;
  ctx.font = ROW_FONT;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";

  // === DATA ROWS ===
  for (let i=0; i<rows.length; i++) {
    const r = rows[i];
    const centerY = rowY + ROW_HEIGHT/2;
    const rankName = getRankName(r.lifetime_points || 0);

    // Row boxes per column
    for (let j=0;j<5;j++) {
      const sx = [col0,col1,col2,col3,col4][j];
      const ex = [col1,col2,col3,col4,col5][j];
      const w = ex - sx;

      ctx.save();
      drawRounded(ctx, sx, rowY, w, ROW_HEIGHT);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = BOX_STROKE;
      ctx.stroke();
      ctx.restore();
    }

    // # number
    text(ctx, `#${i+1}`, cx.num, centerY, col1-col0-40, "center");

    // Trainer name
    text(ctx, r.username || "Unknown", cx.trainer, centerY, col2-col1-40);

    // Rank badge + centered name
    const bx = cx.rank - 75;
    const by = centerY - BADGE_SIZE/2;
    const badgeFile = getBadgeFileForRank(rankName);
    if (badgeFile && fileExistsSafe(path.join(BADGE_DIR, badgeFile))) {
      const img = await loadImage(path.join(BADGE_DIR, badgeFile));
      ctx.drawImage(img,bx,by,BADGE_SIZE,BADGE_SIZE);
    } else {
      ctx.fillText(getBadgeFallbackForRank(rankName), bx+BADGE_SIZE/2, centerY);
    }
    text(ctx, rankName, cx.rank + 75, centerY, col3-col2-80);

    // Points
    text(ctx, String(r.lifetime_points||0), cx.points, centerY, col4-col3-40);

    // Bounties right
    text(ctx, String(r.completed_bounties||0), cx.bounties, centerY, col5-col4-40);

    rowY += ROW_HEIGHT + BOX_GAP;
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
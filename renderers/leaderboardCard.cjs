// renderers/leaderboardCard.cjs
//
// Renders a PNG leaderboard card with columns:
// # | Trainer | Rank (badge + name) | Points | Bounties
//
// - 4:3 aspect ratio: 2400 x 1800
// - Always shows Top 10
// - Uses background image
// - Title + Headers + Rows all in styled text boxes

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

const HEADER_FONT = "bold 60px Sans";
const ROW_FONT = "bold 50px Sans";
const TITLE_FONT = "bold 90px Sans";

const BOX_STROKE = 4;
const BOX_RADIUS = 8;
const BOX_GAP = 28;
const ROW_HEIGHT = 125;

function fileExistsSafe(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

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

async function drawBackground(ctx) {
  if (!fileExistsSafe(BG_PATH)) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    return;
  }
  const img = await loadImage(BG_PATH);
  const scale = Math.max(CARD_WIDTH/img.width, CARD_HEIGHT/img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (CARD_WIDTH-w)/2, (CARD_HEIGHT-h)/2, w, h);
}

// text truncation helper
function text(ctx, txt, x, y, w, align="center") {
  ctx.textAlign = align;
  if (ctx.measureText(txt).width <= w) return ctx.fillText(txt, x, y);
  while (txt.length && ctx.measureText(txt + "…").width > w) {
    txt = txt.slice(0,-1);
  }
  ctx.fillText(txt + "…", x, y);
}

async function createLeaderboardCard(guild) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  await drawBackground(ctx);

  // TITLE BOX
  const title = "Top Hunters Leaderboard";
  ctx.font = TITLE_FONT;
  const tw = ctx.measureText(title).width;
  const tbw = tw + 200;
  const tbh = 120;
  const tbx = (CARD_WIDTH - tbw) / 2;
  const tby = PADDING + 10;

  ctx.save();
  drawRounded(ctx, tbx, tby, tbw, tbh);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = BOX_STROKE;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#000";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(title, tbx + tbw/2, tby + tbh/2);

  // Get top 10 from DB
  const rows = (await db.getLeaderboard(10)).slice(0,10);

  const tableX = PADDING;
  const tableW = CARD_WIDTH - PADDING * 2;

  const headerY = tby + tbh + 70;
  const headerH = 105;

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

  const headers = ["#", "Trainer", "Rank", "Points", "Bounties"];

  // HEADER BOX
  ctx.save();
  drawRounded(ctx, tableX, headerY, tableW, headerH);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = BOX_STROKE;
  ctx.stroke();
  ctx.restore();

  // Header vertical dividers
  ctx.beginPath();
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  [col1,col2,col3,col4].forEach(x=>{
    ctx.moveTo(x,headerY);
    ctx.lineTo(x,headerY+headerH);
  });
  ctx.stroke();

  ctx.font = HEADER_FONT;
  ctx.fillStyle = "#000";
  const hy = headerY + headerH/2;

  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText(headers[0],cx.num,hy);
  ctx.fillText(headers[1],cx.trainer,hy);
  ctx.fillText(headers[2],cx.rank,hy);
  ctx.fillText(headers[3],cx.points,hy);
  ctx.fillText(headers[4],cx.bounties,hy);

  // ROWS BELOW HEADER
  ctx.font = ROW_FONT;
  let y = headerY + headerH + BOX_GAP;

  for (let i=0;i<rows.length;i++) {
    const r = rows[i];
    const rowY = y;
    const centerY = rowY + ROW_HEIGHT/2;
    const rankName = getRankName(r.lifetime_points || 0);

    // box
    ctx.save();
    drawRounded(ctx,tableX,rowY,tableW,ROW_HEIGHT);
    ctx.fillStyle="#ffffff";
    ctx.fill();
    ctx.strokeStyle="#dc2626";
    ctx.lineWidth=BOX_STROKE;
    ctx.stroke();
    ctx.restore();

    // vertical dividers
    ctx.beginPath();
    ctx.strokeStyle="#e5e7eb";
    ctx.lineWidth=2;
    [col1,col2,col3,col4].forEach(x=>{
      ctx.moveTo(x,rowY);
      ctx.lineTo(x,rowY+ROW_HEIGHT);
    });
    ctx.stroke();

    ctx.fillStyle="#000";
    ctx.textBaseline="middle";
    ctx.textAlign="center";

    // #
    ctx.fillText(`#${i+1}`, cx.num, centerY);

    // Trainer
    ctx.textAlign="center";
    text(ctx, r.username || "Unknown", cx.trainer, centerY, col2-col1-40);

    // Rank badge + name centered
    ctx.textAlign="center";
    const bx = cx.rank - 78;
    const by = centerY - BADGE_SIZE/2;
    const badgeFile = BADGE_DIR + "/" + (RANK_BADGE_FILES[rankName] || "");

    if (fileExistsSafe(badgeFile)) {
      const img = await loadImage(badgeFile);
      ctx.drawImage(img,bx,by,BADGE_SIZE,BADGE_SIZE);
    }

    text(ctx, rankName, cx.rank + 70, centerY, col3-col2-40);

    // Points
    ctx.fillText(String(r.lifetime_points || 0),cx.points,centerY);

    // Bounties
    ctx.fillText(String(r.completed_bounties || 0),cx.bounties,centerY);

    y += ROW_HEIGHT + BOX_GAP;
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
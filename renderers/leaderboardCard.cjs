// renderers/leaderboardCard.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const LB_DIR = path.join(__dirname, "card-images");
const BALLS_DIR = path.join(__dirname, "..", "sprites", "balls");

if (!fs.existsSync(LB_DIR)) {
  fs.mkdirSync(LB_DIR, { recursive: true });
}

// 4:3 chosen ratio — scales nicely in Discord
const CARD_WIDTH = 2400;
const CARD_HEIGHT = 1800;

const BORDER_COLOR = "#2b2b2b";
const HEADER_COLOR = "#0f172a";
const GRID_COLOR = "#d4d4d8"; 

const GOLD = "#fbbf24";
const TEXT_DARK = "#111827";
const BLUE = "#1d4ed8";

// Text sizes (+12% bump)
const TITLE_FONT = "bold 150px sans-serif";
const HEADER_FONT = "bold 85px sans-serif";
const ROW_FONT = "bold 78px sans-serif";

// Padding + Layout
const MARGIN = 80;
const TABLE_TOP = 280;

const COL_RANK = 180;
const COL_BADGE = 180; // same size as rank column
const COL_TRAINER = 850;
const COL_RANKNAME = 500;
const COL_POINTS = 350;
const COL_BOUNTIES = 180; // reduced as requested

// Draw helper: center in cell
function centerText(ctx, text, x, y, w) {
  const metrics = ctx.measureText(text);
  const tx = x + (w - metrics.width) / 2;
  ctx.fillText(text, tx, y);
}

async function loadBadge(rankName) {
  if (!rankName) return null;

  const normal = rankName.toLowerCase();
  const map = {
    "rookie trainer": "poke-ball.png",
    "trainer": "great-ball.png",
    "ace trainer": "ultra-ball.png",
    "gym challenger": "premier-ball.png",
    "gym leader": "master-ball.png",
    "elite four": "beast-ball.png",
    "champion": "cherish-ball.png",
    "master": "vortex-ball.png"
  };

  const file = map[normal];
  if (!file) return null;
  const full = path.join(BALLS_DIR, file);

  if (!fs.existsSync(full)) return null;
  return await loadImage(full);
}

async function drawBadge(ctx, badgeImg, x, y, size) {
  if (!badgeImg) return;
  ctx.drawImage(badgeImg, x + (COL_BADGE-size)/2, y-size+65, size, size);
}

async function renderPage(page, pageUsers, totalPages) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = HEADER_COLOR;
  ctx.lineWidth = 14;
  ctx.strokeRect(MARGIN, MARGIN, CARD_WIDTH - MARGIN*2, CARD_HEIGHT - MARGIN*2);

  // Title
  ctx.fillStyle = HEADER_COLOR;
  ctx.font = TITLE_FONT;
  ctx.textAlign = "left";
  ctx.fillText("Top Hunters Leaderboard", MARGIN * 1.2, 200);

  // Page text
  ctx.font = "bold 55px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`Page ${page} — Ranks #${(page-1)*10+1}-${(page-1)*10 + pageUsers.length}`,
               CARD_WIDTH - MARGIN * 1.2, 150);

  // Table Headers
  const headers = ["#", "", "Trainer", "Rank", "Points", "Bounties"];
  const cols = [COL_RANK, COL_BADGE, COL_TRAINER, COL_RANKNAME, COL_POINTS, COL_BOUNTIES];

  ctx.font = HEADER_FONT;
  ctx.fillStyle = HEADER_COLOR;
  let curX = MARGIN * 1.5;

  headers.forEach((h, i) => {
    centerText(ctx, h, curX, TABLE_TOP, cols[i]);
    curX += cols[i];
  });

  const rowHeight = 120;
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 8; // strong grid lines

  // Row content
  let startY = TABLE_TOP + 90;
  ctx.font = ROW_FONT;
  ctx.fillStyle = TEXT_DARK;

  for (let i = 0; i < pageUsers.length; i++) {
    const u = pageUsers[i];
    const y = startY + i * rowHeight;

    const displayName = u.nickname || u.username || "Unknown";

    const fields = [
      `#${u.rank}`,
      "", // badge drawn separately
      displayName,
      u.rankName,
      u.lifetime_points.toString(),
      (u.completed_bounties || 0).toString()
    ];

    curX = MARGIN * 1.5;
    for (let j = 0; j < fields.length; j++) {
      if (j === 4) ctx.fillStyle = GOLD;
      else if (j === 5) ctx.fillStyle = BLUE;
      else ctx.fillStyle = TEXT_DARK;

      if (j !== 1) {
        centerText(ctx, fields[j], curX, y, cols[j]);
      }
      curX += cols[j];
    }

    // Badge
    const badgeImg = await loadBadge(u.rankName);
    if (badgeImg) {
      await drawBadge(ctx, badgeImg, MARGIN*1.5 + COL_RANK, y, 70);
    }

    // Draw line under row
    ctx.beginPath();
    ctx.moveTo(MARGIN*1.5, y + 30);
    ctx.lineTo(CARD_WIDTH - MARGIN*1.5, y + 30);
    ctx.stroke();
  }

  const filename = path.join(LB_DIR, `leaderboard_page${page}_${Date.now()}.png`);
  fs.writeFileSync(filename, canvas.toBuffer("image/png"));
  return filename;
}

async function createLeaderboardCards(userList) {
  const pages = [];

  for (let i = 0; i < userList.length; i += 10) {
    const chunk = userList.slice(i, i + 10).map((u, index) => ({
      ...u,
      rank: i + index + 1
    }));
    const pageNum = (i / 10) + 1;
    pages.push(await renderPage(pageNum, chunk));
  }
  return pages;
}

module.exports = { createLeaderboardCards };
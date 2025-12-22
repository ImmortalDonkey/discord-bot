// renderers/leaderboardCard.cjs
//
// Discord-safe version
//  - Rank column widened (taken from Points column)
//  - NO truncation for Rank text
//  - Strong Discord-safe text rendering (dark halo + white outline + black fill)
//  - No row height changes
//  - No other logic removed unless necessary

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
const BG_PATH = path.join(
  __dirname,
  "leaderboard-bg",
  "leaderboard-card.png"
);

// rank badges (kept for future; currently not drawn)
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
  try {
    return fs.existsSync(fp);
  } catch {
    return false;
  }
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

/**
 * Discord-safe text rendering:
 *  - soft dark halo
 *  - strong white outline
 *  - black fill
 */
function drawTextWithOutline(ctx, text, x, y) {
  const str = String(text ?? "");

  // Soft dark halo (survives Discord downscaling)
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillText(str, x, y);
  ctx.restore();

  // White outline
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeText(str, x, y);

  // Main fill
  ctx.fillStyle = "#000000";
  ctx.fillText(str, x, y);
}

/**
 * Draw truncated text with outline (used ONLY where needed)
 */
function drawTruncatedTextWithOutline(ctx, text, x, y, maxWidth) {
  const full = String(text || "");
  let out = full;

  if (ctx.measureText(full).width > maxWidth) {
    let trimmed = full;
    while (
      trimmed.length &&
      ctx.measureText(trimmed + "…").width > maxWidth
    ) {
      trimmed = trimmed.slice(0, -1);
    }
    out = trimmed + "…";
  }

  drawTextWithOutline(ctx, out, x, y);
}

async function resolveDisplayName(guild, row) {
  let name = row.username || "Unknown";
  try {
    let m =
      guild.members.cache.get(row.discord_id) ||
      (await guild.members.fetch(row.discord_id).catch(() => null));
    if (m) {
      return (
        m.nickname ||
        m.user?.globalName ||
        m.user?.username ||
        name
      );
    }
  } catch {
    // ignore
  }
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
  ctx.drawImage(
    img,
    (CARD_WIDTH - w) / 2,
    (CARD_HEIGHT - h) / 2,
    w,
    h
  );
}

async function createLeaderboardCard(guild) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  await drawBackground(ctx);

  // ----- Title card (solid white) -----
  const title = "Top Hunters Leaderboard";
  ctx.font = "bold 90px Sans";
  const titleW = ctx.measureText(title).width + 200;
  const titleH = 130;
  const titleX = (CARD_WIDTH - titleW) / 2;
  const titleY = PADDING;

  ctx.save();
  drawRoundedRect(ctx, titleX, titleY, titleW, titleH, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#dc2626";
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawTextWithOutline(
    ctx,
    title,
    titleX + titleW / 2,
    titleY + titleH / 2
  );

  // ----- Table geometry -----
  const tableX = PADDING;
  const tableW = CARD_WIDTH - PADDING * 2;
  const rowH = 120;
  const rowGap = 20;

  const headersY = titleY + titleH + 50;
  const firstRowY = headersY + rowH + rowGap;

  // Column allocations (sum == tableW):
  // # = 150, Trainer = 700, Rank = 720, Points = 230, Bounties = 440
  // (Rank widened by taking width from Points)
  const col0 = tableX;
  const col1 = col0 + 150;
  const col2 = col1 + 700;
  const col3 = col2 + 720;
  const col4 = col3 + 230;
  const col5 = col4 + 440; // == tableX + tableW

  const X = {
    rank: (col0 + col1) / 2,
    trainer: (col1 + col2) / 2,
    rankInfo: (col2 + col3) / 2,
    points: (col3 + col4) / 2,
    bounties: (col4 + col5) / 2
  };

  // ----- Header card (25% opacity) -----
  ctx.save();
  ctx.globalAlpha = 0.25;
  drawRoundedRect(ctx, tableX, headersY, tableW, rowH, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Red border (full opacity)
  ctx.save();
  drawRoundedRect(ctx, tableX, headersY, tableW, rowH, 8);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#dc2626";
  ctx.stroke();
  ctx.restore();

  // Header text
  ctx.font = "bold 60px Sans";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const headerY = headersY + rowH / 2;
  drawTextWithOutline(ctx, "Trainer", X.trainer, headerY);
  drawTextWithOutline(ctx, "Rank", X.rankInfo, headerY);
  drawTextWithOutline(ctx, "Points", X.points, headerY);
  drawTextWithOutline(ctx, "Bounties", X.bounties, headerY);

  // ----- Data rows -----
  const list = await db.getLeaderboard(10);

  // Slightly smaller for Discord readability (no row height change)
  ctx.font = "bold 52px Sans";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  for (let i = 0; i < list.length; i++) {
    const usr = list[i];
    const y = firstRowY + i * (rowH + rowGap);
    const cy = y + rowH / 2;

    const name = await resolveDisplayName(guild, usr);
    const rankName = getRankName(usr.lifetime_points);
    const lifetime = usr.lifetime_points || 0;
    const completed = usr.completed_bounties || 0;

    // Row background (25% opacity)
    ctx.save();
    ctx.globalAlpha = 0.25;
    drawRoundedRect(ctx, tableX, y, tableW, rowH, 8);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    // Row border (full opacity)
    ctx.save();
    drawRoundedRect(ctx, tableX, y, tableW, rowH, 8);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#dc2626";
    ctx.stroke();
    ctx.restore();

    // # position
    drawTextWithOutline(ctx, `#${i + 1}`, X.rank, cy);

    // Trainer name (truncate only here)
    const trainerMaxWidth = col2 - col1 - 60;
    drawTruncatedTextWithOutline(
      ctx,
      name,
      X.trainer,
      cy,
      trainerMaxWidth
    );

    // Rank name (NO truncation)
    drawTextWithOutline(ctx, rankName, X.rankInfo, cy);

    // Points
    drawTextWithOutline(ctx, String(lifetime), X.points, cy);

    // Bounties
    drawTextWithOutline(ctx, String(completed), X.bounties, cy);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardCard };
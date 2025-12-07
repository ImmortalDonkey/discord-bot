// renderers/leaderboardCard.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// 4:3 aspect ratio
const CARD_WIDTH = 1920;
const CARD_HEIGHT = 1440;

const MARGIN = 80;

// Where the rank badges live
// e.g. sprites/balls/poke-ball.png, great-ball.png, etc.
const BALLS_DIR = path.join(__dirname, '..', 'sprites', 'balls');

// Cache for loaded images
const imageCache = new Map();

/**
 * Load an image with simple in-memory cache.
 */
async function loadCachedImage(filePath) {
  if (imageCache.has(filePath)) {
    return imageCache.get(filePath);
  }
  const img = await loadImage(filePath);
  imageCache.set(filePath, img);
  return img;
}

/**
 * Map rank name -> badge file name.
 */
function getBallFileForRank(rankName) {
  const rank = String(rankName || '').toLowerCase();

  if (rank.includes('master')) return 'vortex-ball.png'; // "Master"
  if (rank.includes('champion')) return 'cherish-ball.png';
  if (rank.includes('elite four')) return 'beast-ball.png';
  if (rank.includes('gym leader')) return 'master-ball.png';
  if (rank.includes('gym challenger')) return 'premier-ball.png';
  if (rank.includes('ace trainer')) return 'ultra-ball.png';
  if (rank.includes('trainer') && !rank.includes('rookie')) return 'great-ball.png';
  if (rank.includes('rookie')) return 'poke-ball.png';

  // Fallback
  return 'poke-ball.png';
}

/**
 * Draw a rank badge in its own column cell.
 */
async function drawBadge(ctx, cellX, cellY, cellW, cellH, rankName) {
  const fileName = getBallFileForRank(rankName);
  const badgePath = path.join(BALLS_DIR, fileName);

  if (!fs.existsSync(badgePath)) return;

  const img = await loadCachedImage(badgePath);

  // Square area inside the cell
  const size = Math.min(cellW, cellH) * 0.6;
  const cx = cellX + cellW / 2;
  const cy = cellY + cellH / 2;

  const drawX = cx - size / 2;
  const drawY = cy - size / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = false; // crisp pixel style
  ctx.drawImage(img, drawX, drawY, size, size);
  ctx.restore();
}

/**
 * Create a leaderboard page as a PNG buffer.
 *
 * @param {Array} entries - up to 10 entries:
 *    { position, trainerName, rankName, lifetimePoints, completedBounties }
 * @param {number} page - page number (1-based)
 * @returns {Buffer} PNG buffer
 */
async function createLeaderboardCard(entries, page = 1) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  // ─────────────────────────────
  // BASE BACKGROUND + OUTER CARD
  // ─────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const outerRadius = 40;
  const outerX = MARGIN;
  const outerY = MARGIN;
  const outerW = CARD_WIDTH - MARGIN * 2;
  const outerH = CARD_HEIGHT - MARGIN * 2;

  function roundedRectPath(x, y, w, h, r) {
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

  // Outer card
  ctx.save();
  roundedRectPath(outerX, outerY, outerW, outerH, outerRadius);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const borderWidth = 8;
  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = '#000000'; // black border
  ctx.stroke();
  ctx.restore();

  // ─────────────────────────────
  // TITLE + PAGE LABEL
  // ─────────────────────────────
  const titlePadding = 40;
  const titleX = outerX + titlePadding;
  const titleY = outerY + titlePadding + 70; // baseline

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 88px sans-serif'; // increased by ~10%

  ctx.fillText('Top Hunters Leaderboard', titleX, titleY);

  // Page label on the right ("Page 1 — Ranks #1–10")
  const firstRank = (page - 1) * 10 + 1;
  const lastRank = firstRank + entries.length - 1;

  ctx.font = 'bold 40px sans-serif';
  const pageLabel = `Page ${page} — Ranks #${firstRank}–#${lastRank}`;
  ctx.textAlign = 'right';
  ctx.fillText(pageLabel, outerX + outerW - titlePadding, titleY - 20);

  // ─────────────────────────────
  // TABLE GEOMETRY
  // ─────────────────────────────
  const tableTopMargin = 50;
  const tableX = outerX + 40;
  const tableY = titleY + tableTopMargin;
  const tableW = outerW - 80;
  const tableH = outerH - (tableY - outerY) - 40;

  const headerHeight = 90;
  const rowCount = Math.max(entries.length, 1);
  const bodyHeight = tableH - headerHeight;
  const rowHeight = bodyHeight / rowCount;

  // Column layout (must sum to 1.0)
  const colFractions = {
    pos: 0.08,
    badge: 0.08,
    trainer: 0.34,
    rank: 0.22,
    points: 0.18,
    bounties: 0.10 // narrower
  };

  const colWidths = {};
  colWidths.pos = tableW * colFractions.pos;
  colWidths.badge = tableW * colFractions.badge;
  colWidths.trainer = tableW * colFractions.trainer;
  colWidths.rank = tableW * colFractions.rank;
  colWidths.points = tableW * colFractions.points;
  colWidths.bounties = tableW * colFractions.bounties;

  const colXs = {};
  colXs.pos = tableX;
  colXs.badge = colXs.pos + colWidths.pos;
  colXs.trainer = colXs.badge + colWidths.badge;
  colXs.rank = colXs.trainer + colWidths.trainer;
  colXs.points = colXs.rank + colWidths.rank;
  colXs.bounties = colXs.points + colWidths.points;

  // ─────────────────────────────
  // TABLE BACKGROUND
  // ─────────────────────────────
  ctx.save();
  roundedRectPath(tableX, tableY, tableW, tableH, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = borderWidth; // same as outer border
  ctx.strokeStyle = '#000000';
  ctx.stroke();
  ctx.restore();

  // ─────────────────────────────
  // GRID LINES (same thickness as border)
  // ─────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = '#000000';

  // Horizontal lines: header + each row
  const headerBottomY = tableY + headerHeight;
  ctx.moveTo(tableX, headerBottomY);
  ctx.lineTo(tableX + tableW, headerBottomY);

  for (let i = 1; i < rowCount; i++) {
    const y = headerBottomY + rowHeight * i;
    ctx.moveTo(tableX, y);
    ctx.lineTo(tableX + tableW, y);
  }

  // Vertical lines between columns (including left/right edges)
  const colBoundaries = [
    tableX,
    colXs.pos + colWidths.pos,
    colXs.badge + colWidths.badge,
    colXs.trainer + colWidths.trainer,
    colXs.rank + colWidths.rank,
    colXs.points + colWidths.points,
    tableX + tableW
  ];

  for (const x of colBoundaries) {
    ctx.moveTo(x, tableY);
    ctx.lineTo(x, tableY + tableH);
  }

  ctx.stroke();
  ctx.restore();

  // ─────────────────────────────
  // TABLE HEADERS
  // ─────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 46px sans-serif';
  ctx.textBaseline = 'middle';

  const headerCenterY = tableY + headerHeight / 2;

  // "#"
  ctx.textAlign = 'center';
  ctx.fillText('#', colXs.pos + colWidths.pos / 2, headerCenterY);

  // Badge column header left blank (or small icon label); we leave it empty
  // Trainer
  ctx.textAlign = 'center';
  ctx.fillText('Trainer', colXs.trainer + colWidths.trainer / 2, headerCenterY);

  // Rank
  ctx.fillText('Rank', colXs.rank + colWidths.rank / 2, headerCenterY);

  // Points
  ctx.fillText('Points', colXs.points + colWidths.points / 2, headerCenterY);

  // Bounties
  ctx.fillText('Bounties', colXs.bounties + colWidths.bounties / 2, headerCenterY);

  // ─────────────────────────────
  // ROWS
  // ─────────────────────────────
  ctx.font = 'bold 42px sans-serif'; // body text (all bold)
  ctx.textAlign = 'center';

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const rowY = headerBottomY + rowHeight * i;
    const cellCenterY = rowY + rowHeight / 2;

    const position = e.position ?? (firstRank + i);
    const trainerName =
      (e.trainerName && String(e.trainerName).trim()) ||
      (e.username && String(e.username).trim()) ||
      'Unknown Trainer';

    const rankName =
      (e.rankName && String(e.rankName).trim()) ||
      'Trainer';

    const lifetimePoints = e.lifetimePoints ?? 0;
    const bounties = e.completedBounties ?? 0;

    // # column (left aligned inside its cell a bit)
    ctx.textAlign = 'center';
    ctx.fillText(`#${position}`, colXs.pos + colWidths.pos / 2, cellCenterY);

    // Badge column (image)
    await drawBadge(
      ctx,
      colXs.badge,
      rowY,
      colWidths.badge,
      rowHeight,
      rankName
    );

    // Trainer name
    ctx.textAlign = 'center';
    ctx.fillText(
      trainerName,
      colXs.trainer + colWidths.trainer / 2,
      cellCenterY
    );

    // Rank name
    ctx.fillText(
      rankName,
      colXs.rank + colWidths.rank / 2,
      cellCenterY
    );

    // Points
    ctx.fillText(
      String(lifetimePoints),
      colXs.points + colWidths.points / 2,
      cellCenterY
    );

    // Bounties
    ctx.fillText(
      String(bounties),
      colXs.bounties + colWidths.bounties / 2,
      cellCenterY
    );
  }

  // If fewer than 10 entries on this page, we leave blank rows (grid still visible).

  const buffer = canvas.toBuffer('image/png');
  return buffer;
}

module.exports = {
  createLeaderboardCard
};
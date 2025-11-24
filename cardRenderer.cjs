// cardRenderer.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Overall canvas. Discord will scale this down, but aspect stays the same.
const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;

const MARGIN = 60;

// Text vs image width ratio
const TEXT_RATIO = 0.6;  // 60% text
const IMAGE_RATIO = 0.4; // 40% image

// Text layout
const FONT_SIZE = 58;                    // header + value
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.2); // vertical spacing per row
const GROUP_GAP = Math.round(LINE_HEIGHT * 0.7); // extra gap between groups

const HEADER_COLOR = '#facc15'; // bright gold
const VALUE_COLOR = '#f9fafb';
const BOX_BG_COLOR_DEFAULT = 'rgba(15, 23, 42, 0.95)'; // dark slate-ish
const BOX_BORDER_COLOR = '#f9fafb';
const BOX_BORDER_WIDTH = 8;

const NOTE_FONT_SIZE = 58;
const NOTE_LINE_HEIGHT = Math.round(NOTE_FONT_SIZE * 1.2);

// Directory to save cards
const CARDS_DIR = path.join(__dirname, 'card-images');

// Ensure output folder exists
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

// Rarity styles: gradient background, box colour if ever needed per-rarity
const rarityStyles = {
  paradox: {
    gradientFrom: '#3b82f6',
    gradientTo: '#a855f7',
    boxColor: 'rgba(15, 23, 42, 0.95)'
  },
  roamerMonth: {
    gradientFrom: '#f59e0b',
    gradientTo: '#ea580c',
    boxColor: 'rgba(17, 24, 39, 0.95)'
  },
  legendary: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee',
    boxColor: 'rgba(15, 23, 42, 0.95)'
  },
  rare: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee',
    boxColor: 'rgba(15, 23, 42, 0.95)'
  },
  common: {
    gradientFrom: '#16a34a',
    gradientTo: '#0f766e',
    boxColor: 'rgba(5, 46, 22, 0.95)'
  }
};

function getStyleForRarity(key) {
  return rarityStyles[key] || rarityStyles.common;
}

function roundedRectPath(ctx, x, y, w, h, r) {
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

// Simple word wrapping for note text
function wrapText(ctx, text, maxWidth, fontSpec) {
  ctx.font = fontSpec;
  const words = (text || '').split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const testLine = current ? current + ' ' + word : word;
    if (ctx.measureText(testLine).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = testLine;
    }
  }
  if (current) lines.push(current);

  return lines.length ? lines : [''];
}

/**
 * Draws the main info block with key/value pairs, vertically centred.
 * rows: [{ label, value, groupBreakAfter?: bool }]
 */
function drawInfoBlock(ctx, x, y, w, h, rows, boxColor) {
  const paddingX = 40;
  const paddingY = 30;

  // Background box
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 40);
  ctx.fillStyle = boxColor || BOX_BG_COLOR_DEFAULT;
  ctx.fill();

  // Border
  ctx.lineWidth = BOX_BORDER_WIDTH;
  ctx.strokeStyle = BOX_BORDER_COLOR;
  ctx.stroke();

  // Prepare text
  const headerFont = `bold ${FONT_SIZE}px sans-serif`;
  const valueFont = `bold ${FONT_SIZE}px sans-serif`;

  ctx.font = headerFont;

  // Fixed header column width & gap
  const headerColWidth = 360; // space for "Start time:" etc.
  const gap = 50;
  const valueStartX = x + paddingX + headerColWidth + gap;
  const maxContentWidth = w - paddingX * 2 - headerColWidth - gap;

  // Calculate total height of all lines for vertical centering
  let linesCount = rows.length;
  let groupBreaks = 0;
  for (const row of rows) {
    if (row.groupBreakAfter) groupBreaks++;
  }
  const totalHeight = linesCount * LINE_HEIGHT + groupBreaks * GROUP_GAP;
  let currentY = y + (h - totalHeight) / 2;

  // Draw each row
  for (const row of rows) {
    const label = row.label || '';
    const value = row.value || '';

    // Label
    ctx.font = headerFont;
    ctx.fillStyle = HEADER_COLOR;
    ctx.textBaseline = 'top';

    ctx.fillText(label, x + paddingX, currentY);

    // Value
    ctx.font = valueFont;
    ctx.fillStyle = VALUE_COLOR;

    // Very simple clipping protection: if value is too wide, reduce font a bit
    let valueToDraw = value;
    let valueFontSize = FONT_SIZE;
    while (ctx.measureText(valueToDraw).width > maxContentWidth && valueFontSize > 44) {
      valueFontSize -= 2;
      ctx.font = `bold ${valueFontSize}px sans-serif`;
    }

    ctx.fillText(valueToDraw, valueStartX, currentY);

    currentY += LINE_HEIGHT;
    if (row.groupBreakAfter) {
      currentY += GROUP_GAP;
    }

    // restore default for next loop
    ctx.font = headerFont;
  }

  ctx.restore();
}

/**
 * Draws the note box with vertically centred wrapped text.
 */
function drawNoteBox(ctx, x, y, w, h, note, boxColor) {
  const paddingX = 40;
  const paddingY = 30;

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 40);
  ctx.fillStyle = boxColor || BOX_BG_COLOR_DEFAULT;
  ctx.fill();

  ctx.lineWidth = BOX_BORDER_WIDTH;
  ctx.strokeStyle = BOX_BORDER_COLOR;
  ctx.stroke();

  const fontSpec = `bold ${NOTE_FONT_SIZE}px sans-serif`;
  const maxWidth = w - paddingX * 2;

  const lines = wrapText(ctx, note || 'None', maxWidth, fontSpec);
  const totalHeight = lines.length * NOTE_LINE_HEIGHT;
  let currentY = y + (h - totalHeight) / 2;

  ctx.font = fontSpec;
  ctx.fillStyle = VALUE_COLOR;
  ctx.textBaseline = 'top';

  for (const line of lines) {
    ctx.fillText(line, x + paddingX, currentY);
    currentY += NOTE_LINE_HEIGHT;
  }

  ctx.restore();
}

/**
 * options:
 *  - bountyId
 *  - username
 *  - rankName
 *  - rarityKey
 *  - rarityLabel
 *  - pokemons[]     (first one treated as "Target")
 *  - startLabel
 *  - endLabel
 *  - durationLabel
 *  - note
 *  - rewardLabel
 *  - avatarUrl
 *
 * Returns: full file path of generated PNG.
 */
async function createBountyCard(options) {
  const {
    bountyId,
    username,
    rankName,
    rarityKey,
    rarityLabel,
    pokemons,
    startLabel,
    endLabel,
    durationLabel,
    note,
    rewardLabel,
    avatarUrl
  } = options;

  const style = getStyleForRarity(rarityKey);

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  gradient.addColorStop(0, style.gradientFrom);
  gradient.addColorStop(1, style.gradientTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Subtle overlay for contrast
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Compute layout
  const textAreaWidth = Math.floor(CARD_WIDTH * TEXT_RATIO) - MARGIN * 2;
  const imageAreaWidth = Math.floor(CARD_WIDTH * IMAGE_RATIO) - MARGIN * 2;

  const leftX = MARGIN;
  const leftY = MARGIN;
  const leftTotalHeight = CARD_HEIGHT - MARGIN * 2;

  const gapBetweenBoxes = 40;

  const topBoxHeight = Math.round(leftTotalHeight * 0.7);
  const noteBoxHeight = leftTotalHeight - topBoxHeight - gapBetweenBoxes;

  const topBoxX = leftX;
  const topBoxY = leftY;
  const noteBoxX = leftX;
  const noteBoxY = topBoxY + topBoxHeight + gapBetweenBoxes;

  // Right-side image: use a square inside the right area, centred vertically
  const rightAreaX = leftX + textAreaWidth + MARGIN;
  const rightAreaWidth = imageAreaWidth;

  const maxSquareSize = Math.min(
    rightAreaWidth,
    CARD_HEIGHT - 2 * MARGIN
  );
  const squareSize = maxSquareSize;

  const imageX = rightAreaX + (rightAreaWidth - squareSize) / 2;
  const imageY = (CARD_HEIGHT - squareSize) / 2;

  // Draw info box
  const targetName = (pokemons && pokemons.length) ? pokemons[0] : '—';

  const infoRows = [
    { label: 'Trainer:', value: username || 'Unknown' },
    { label: 'Rank:', value: rankName || '—', groupBreakAfter: true },

    { label: 'Target:', value: targetName || '—' },
    { label: 'Rarity:', value: rarityLabel || '—' },
    { label: 'Reward:', value: rewardLabel || '—', groupBreakAfter: true },

    { label: 'Start time:', value: startLabel || '—' },
    { label: 'Ends:', value: endLabel || '—' },
    { label: 'Duration:', value: durationLabel || '—' }
  ];

  drawInfoBlock(
    ctx,
    topBoxX,
    topBoxY,
    textAreaWidth,
    topBoxHeight,
    infoRows,
    style.boxColor
  );

  // Draw note box
  drawNoteBox(
    ctx,
    noteBoxX,
    noteBoxY,
    textAreaWidth,
    noteBoxHeight,
    note || 'None',
    style.boxColor
  );

  // Draw avatar/card image on the right as a square (no cropping, contain)
  ctx.save();
  try {
    const img = await loadImage(avatarUrl);

    const imgAspect = img.width / img.height;
    let drawW = squareSize;
    let drawH = squareSize;

    // "Contain" fit inside square
    if (imgAspect > 1) {
      // wider than tall
      drawW = squareSize;
      drawH = squareSize / imgAspect;
    } else {
      // taller than wide
      drawH = squareSize;
      drawW = squareSize * imgAspect;
    }

    const cx = imageX + (squareSize - drawW) / 2;
    const cy = imageY + (squareSize - drawH) / 2;

    roundedRectPath(ctx, imageX, imageY, squareSize, squareSize, 42);
    ctx.clip();

    ctx.drawImage(img, cx, cy, drawW, drawH);

    ctx.lineWidth = BOX_BORDER_WIDTH;
    ctx.strokeStyle = BOX_BORDER_COLOR;
    ctx.stroke();
  } catch (err) {
    // Fallback if image fails
    roundedRectPath(ctx, imageX, imageY, squareSize, squareSize, 42);
    ctx.clip();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(imageX, imageY, squareSize, squareSize);

    ctx.font = `bold ${FONT_SIZE}px sans-serif`;
    ctx.fillStyle = VALUE_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No Image', imageX + squareSize / 2, imageY + squareSize / 2);
  }
  ctx.restore();
  ctx.textAlign = 'left';

  // Save PNG
  const fileName = `bounty_${bountyId}.png`;
  const outPath = path.join(CARDS_DIR, fileName);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buffer);

  return outPath;
}

module.exports = {
  createBountyCard
};

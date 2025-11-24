// cardRenderer.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Final canvas size (Discord target)
const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;

// Layout
const MARGIN = 50;
const CARDS_DIR = path.join(__dirname, 'card-images');

// Ensure output folder exists
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

// Rarity styles: background gradient only, boxes are dark
const rarityStyles = {
  paradox: {
    gradientFrom: '#3b82f6',
    gradientTo: '#a855f7'
  },
  roamerMonth: {
    gradientFrom: '#f59e0b',
    gradientTo: '#ea580c'
  },
  legendary: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee'
  },
  rare: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee'
  },
  common: {
    gradientFrom: '#16a34a',
    gradientTo: '#0f766e'
  }
};

function getStyleForRarity(key) {
  return rarityStyles[key] || rarityStyles.common;
}

// Rounded rect helper
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

// Draw a dark box with white border
function drawBoxBackground(ctx, x, y, w, h) {
  const radius = 32;
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = 'rgba(3, 7, 18, 0.96)'; // very dark
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.clip();
  ctx.restore();
}

/**
 * Draw the top info box rows with aligned columns.
 * rows: array of { header, value, groupAfter?: boolean }
 */
function drawInfoRows(ctx, x, y, w, h, rows) {
  const paddingX = 36;
  const paddingTop = 32;
  const lineSpacing = 60;
  const groupExtraSpacing = 40;

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 32);
  ctx.clip();

  // Set font *before* measuring
  ctx.font = 'bold 40px sans-serif';

  // Determine fixed header width using the longest header
  const longestHeader = 'Start time:'; // known longest header
  const headerWidth = ctx.measureText(longestHeader).width;
  const gap = 50;

  const headerX = x + paddingX;
  const valueX = headerX + headerWidth + gap;
  const maxValueWidth = x + w - paddingX - valueX;

  let currentY = y + paddingTop;

  for (const row of rows) {
    const header = row.header || '';
    const value = row.value || '';

    // Draw header (gold)
    ctx.fillStyle = '#facc15'; // bright gold
    ctx.textBaseline = 'top';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(header, headerX, currentY);

    // Draw value (wrapped if needed)
    ctx.fillStyle = '#ffffff';
    const words = value.split(' ');
    let line = '';
    let firstLine = true;

    for (const word of words) {
      const testLine = line ? line + ' ' + word : word;
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth > maxValueWidth && line !== '') {
        // Draw current line
        ctx.fillText(line, valueX, currentY);
        currentY += lineSpacing;
        line = word;
        firstLine = false;
      } else {
        line = testLine;
      }
    }

    if (line) {
      ctx.fillText(line, valueX, currentY);
      currentY += lineSpacing;
    } else if (firstLine) {
      // No words but still advance line-height
      currentY += lineSpacing;
    }

    if (row.groupAfter) {
      currentY += groupExtraSpacing;
    }
  }

  ctx.restore();
}

/**
 * Draw note text in the bottom box (no header, full width wrap)
 */
function drawNoteBox(ctx, x, y, w, h, note) {
  const paddingX = 36;
  const paddingTop = 32;
  const lineSpacing = 56;

  const text = note && note.trim().length ? note : 'None';

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 32);
  ctx.clip();

  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';

  const maxWidth = w - paddingX * 2;
  const words = text.split(' ');
  let line = '';
  let currentY = y + paddingTop;

  for (const word of words) {
    const testLine = line ? line + ' ' + word : word;
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && line !== '') {
      ctx.fillText(line, x + paddingX, currentY);
      currentY += lineSpacing;
      line = word;
    } else {
      line = testLine;
    }
  }

  if (line) {
    ctx.fillText(line, x + paddingX, currentY);
  }

  ctx.restore();
}

/**
 * options:
 *  - bountyId
 *  - username
 *  - rankName
 *  - rarityKey ('paradox','roamerMonth','legendary','rare','common')
 *  - rarityLabel
 *  - pokemons: array of strings
 *  - startLabel
 *  - endLabel
 *  - durationLabel  (e.g. "3 hours (Ends in 2h 23m)")
 *  - note
 *  - rewardLabel    (e.g. "10,000,000 PKD")
 *  - avatarUrl
 *
 * Returns: full file path to generated PNG
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

  // Create canvas
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  gradient.addColorStop(0, style.gradientFrom);
  gradient.addColorStop(1, style.gradientTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Slight dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Inner layout (55% text / 45% image)
  const innerWidth = CARD_WIDTH - MARGIN * 3;
  const innerHeight = CARD_HEIGHT - MARGIN * 2;

  const textPanelWidth = Math.round(innerWidth * 0.55);
  const imagePanelWidth = innerWidth - textPanelWidth;

  const textX = MARGIN;
  const textY = MARGIN;
  const textW = textPanelWidth;
  const textH = innerHeight;

  const imageX = textX + textW + MARGIN;
  const imageY = MARGIN;
  const imageW = imagePanelWidth;
  const imageH = innerHeight;

  // ===== RIGHT IMAGE PANEL (45%) — no cropping, full height =====
  ctx.save();
  try {
    const img = await loadImage(avatarUrl);

    // Fit inside imageW × imageH, preserve aspect ratio, no cropping
    const aspect = img.width / img.height;
    let drawW = imageW;
    let drawH = imageH;

    if (aspect > imageW / imageH) {
      // too wide, limit width
      drawW = imageW;
      drawH = imageW / aspect;
    } else {
      // too tall, limit height
      drawH = imageH;
      drawW = imageH * aspect;
    }

    const dx = imageX + (imageW - drawW) / 2;
    const dy = imageY + (imageH - drawH) / 2;

    // Rounded panel + border
    const radius = 40;
    roundedRectPath(ctx, imageX, imageY, imageW, imageH, radius);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.clip();

    ctx.drawImage(img, dx, dy, drawW, drawH);

    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  } catch (err) {
    // Fallback placeholder
    const radius = 40;
    roundedRectPath(ctx, imageX, imageY, imageW, imageH, radius);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = '#e5e7eb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No Image', imageX + imageW / 2, imageY + imageH / 2);
  }
  ctx.restore();

  ctx.textAlign = 'left';

  // ===== LEFT TEXT PANEL (55%) =====
  // Two stacked boxes: top info, bottom note
  const boxGap = 26;
  const topBoxHeight = Math.round(textH * 0.6);
  const bottomBoxHeight = textH - topBoxHeight - boxGap;

  const topBoxX = textX;
  const topBoxY = textY;
  const topBoxW = textW;
  const topBoxH = topBoxHeight;

  const bottomBoxX = textX;
  const bottomBoxY = textY + topBoxHeight + boxGap;
  const bottomBoxW = textW;
  const bottomBoxH = bottomBoxHeight;

  // Draw box backgrounds with border
  drawBoxBackground(ctx, topBoxX, topBoxY, topBoxW, topBoxH);
  drawBoxBackground(ctx, bottomBoxX, bottomBoxY, bottomBoxW, bottomBoxH);

  // Build rows for the top info box
  const pokemonDisplay = (pokemons && pokemons.length) ? pokemons[0] : 'None';

  const rows = [
    { header: 'Trainer:',   value: username },
    { header: 'Rank:',      value: rankName, groupAfter: true },

    { header: 'Target:',    value: pokemonDisplay },
    { header: 'Rarity:',    value: rarityLabel },
    { header: 'Reward:',    value: rewardLabel, groupAfter: true },

    { header: 'Start time:', value: startLabel },
    { header: 'Ends:',       value: endLabel },
    { header: 'Duration:',   value: durationLabel }
  ];

  // Draw info rows (headers gold, values white, aligned column)
  drawInfoRows(ctx, topBoxX, topBoxY, topBoxW, topBoxH, rows);

  // Draw note box (no header)
  drawNoteBox(ctx, bottomBoxX, bottomBoxY, bottomBoxW, bottomBoxH, note);

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

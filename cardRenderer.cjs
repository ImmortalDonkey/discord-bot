// cardRenderer.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const CARD_WIDTH = 1700;
const CARD_HEIGHT = 900;
const MARGIN = 50;
const RIGHT_WIDTH = 600;

const CARDS_DIR = path.join(__dirname, 'card-images');
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

// background colours by rarity
const rarityStyles = {
  paradox: { gradientFrom: '#3b82f6', gradientTo: '#a855f7' },
  roamerMonth: { gradientFrom: '#f59e0b', gradientTo: '#ea580c' },
  legendary: { gradientFrom: '#1d4ed8', gradientTo: '#22d3ee' },
  rare: { gradientFrom: '#1d4ed8', gradientTo: '#22d3ee' },
  common: { gradientFrom: '#16a34a', gradientTo: '#0f766e' }
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

// simple wrapper for value text
function wrapText(ctx, text, maxWidth) {
  const words = (text || '').split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// draw "Label: Value" with label in gold and value in white
function drawLabelValue(ctx, label, value, x, y, maxWidth, lineHeight) {
  const LABEL_COLOR = '#facc15'; // gold
  const VALUE_COLOR = '#f9fafb';

  const labelText = `${label}: `;
  ctx.font = 'bold 44px sans-serif';

  // width taken by the label
  const labelWidth = ctx.measureText(labelText).width;
  const valueMaxWidth = Math.max(10, maxWidth - labelWidth);

  // split value into wrapped lines
  const valueLines = wrapText(ctx, value || '', valueMaxWidth);
  const totalLines = Math.max(1, valueLines.length);

  // first line: label + first part of value
  ctx.fillStyle = LABEL_COLOR;
  ctx.fillText(labelText, x, y);

  ctx.fillStyle = VALUE_COLOR;
  const firstValue = valueLines[0] || '';
  ctx.fillText(firstValue, x + labelWidth, y);

  // remaining lines: value only, aligned under value column
  for (let i = 1; i < totalLines; i++) {
    const lineY = y + lineHeight * i;
    ctx.fillText(valueLines[i], x + labelWidth, lineY);
  }

  return y + lineHeight * totalLines;
}

/**
 * options:
 *  - bountyId
 *  - username
 *  - rankName
 *  - rarityKey
 *  - rarityLabel
 *  - pokemons[] (array of strings)
 *  - startLabel
 *  - endLabel
 *  - durationLabel
 *  - note
 *  - rewardLabel
 *  - avatarUrl
 *
 * Returns: full file path
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

  // dark overlay for contrast
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // layout
  const leftX = MARGIN;
  const topY = MARGIN;
  const leftWidth = CARD_WIDTH - RIGHT_WIDTH - MARGIN * 3;

  const rightX = leftX + leftWidth + MARGIN;
  const rightY = MARGIN;
  const rightSize = CARD_HEIGHT - MARGIN * 2;

  // RIGHT IMAGE
  ctx.save();
  try {
    const img = await loadImage(avatarUrl);

    let drawW = rightSize;
    let drawH = rightSize;
    const aspect = img.width / img.height;

    if (aspect > 1) {
      drawH = rightSize / aspect;
    } else {
      drawW = rightSize * aspect;
    }

    const cx = rightX + (rightSize - drawW) / 2;
    const cy = rightY + (rightSize - drawH) / 2;

    roundedRectPath(ctx, rightX, rightY, rightSize, rightSize, 40);
    ctx.clip();
    ctx.drawImage(img, cx, cy, drawW, drawH);

    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.9)';
    ctx.stroke();
  } catch (err) {
    roundedRectPath(ctx, rightX, rightY, rightSize, rightSize, 40);
    ctx.clip();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(rightX, rightY, rightSize, rightSize);
    ctx.font = 'bold 42px sans-serif';
    ctx.fillStyle = '#e5e7eb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No Image', rightX + rightSize / 2, rightY + rightSize / 2);
  }
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 44px sans-serif';

  const lineHeight = 56;
  let y = topY;

  // SECTION 1: Trainer
  y = drawLabelValue(ctx, 'Trainer', username, leftX, y, leftWidth, lineHeight);
  y = drawLabelValue(ctx, 'Rank', rankName, leftX, y, leftWidth, lineHeight);

  y += 30;

  // SECTION 2: Target / rarity / reward
  const targets = (pokemons && pokemons.length) ? pokemons.join(', ') : 'None';
  y = drawLabelValue(ctx, 'Target', targets, leftX, y, leftWidth, lineHeight);
  y = drawLabelValue(ctx, 'Rarity', rarityLabel, leftX, y, leftWidth, lineHeight);
  y = drawLabelValue(ctx, 'Reward', rewardLabel, leftX, y, leftWidth, lineHeight);

  y += 30;

  // SECTION 3: Timing
  y = drawLabelValue(ctx, 'Start time', startLabel, leftX, y, leftWidth, lineHeight);
  y = drawLabelValue(ctx, 'Ends', endLabel, leftX, y, leftWidth, lineHeight);
  y = drawLabelValue(ctx, 'Duration', durationLabel, leftX, y, leftWidth, lineHeight);

  y += 30;

  // SECTION 4: Note
  y = drawLabelValue(ctx, 'Note', note || 'None', leftX, y, leftWidth, lineHeight);

  // Save image
  const filePath = path.join(CARDS_DIR, `bounty_${bountyId}.png`);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  return filePath;
}

module.exports = { createBountyCard };

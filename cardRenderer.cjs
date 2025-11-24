// cardRenderer.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const OUTPUT_WIDTH = 2200;  // Discord-friendly HD ratio
const OUTPUT_HEIGHT = 1300;

const LEFT_RATIO = 0.60;   // text 60%
const RIGHT_RATIO = 0.40;  // image 40%

const BORDER_RADIUS = 40;
const BORDER_WIDTH = 8;

const FONT_HEADER = 'bold 55px sans-serif';
const FONT_VALUE = 'bold 55px sans-serif';
const HEADER_COLOR = '#facc15'; // bright gold
const VALUE_COLOR = '#ffffff';

const CARDS_DIR = path.join(__dirname, 'card-images');
if (!fs.existsSync(CARDS_DIR)) fs.mkdirSync(CARDS_DIR, { recursive: true });

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';

  for (const w of words) {
    const testLine = line + w + ' ';
    if (ctx.measureText(testLine).width > maxWidth) {
      ctx.fillText(line, x, y);
      line = w + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
  return y + lineHeight;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function createBountyCard({
  bountyId,
  username,
  rankName,
  rarityLabel,
  pokemons,
  startLabel,
  endLabel,
  durationLabel,
  note,
  rewardLabel,
  avatarUrl
}) {
  // Canvas init
  const canvas = createCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, OUTPUT_WIDTH, 0);
  grad.addColorStop(0, '#b45309');
  grad.addColorStop(1, '#c2410c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  const margin = 40;

  // ================================
  // LAYOUT DIMENSIONS
  // ================================
  const leftW = OUTPUT_WIDTH * LEFT_RATIO - margin * 2;
  const rightW = OUTPUT_WIDTH * RIGHT_RATIO - margin * 2;

  const leftX = margin;
  const rightX = OUTPUT_WIDTH * LEFT_RATIO + margin;

  const topBoxH = OUTPUT_HEIGHT * 0.70 - margin * 2;
  const bottomBoxH = OUTPUT_HEIGHT * 0.30 - margin * 2;

  const topBoxY = margin;
  const bottomBoxY = OUTPUT_HEIGHT * 0.70 + margin;

  // ================================
  // DRAW IMAGE (square, centered)
  // ================================
  ctx.save();
  try {
    const img = await loadImage(avatarUrl);

    const squareSize = OUTPUT_HEIGHT - margin * 2;
    const imgX = rightX;
    const imgY = (OUTPUT_HEIGHT - squareSize) / 2;

    // Clip border shape
    roundedRect(ctx, imgX, imgY, rightW, squareSize, BORDER_RADIUS);
    ctx.clip();

    // Fit image inside the square area
    let drawW = squareSize;
    let drawH = squareSize;
    const ratio = img.width / img.height;

    if (ratio > 1) drawH = squareSize / ratio;
    else drawW = squareSize * ratio;

    const dx = imgX + (rightW - drawW) / 2;
    const dy = imgY + (squareSize - drawH) / 2;

    ctx.drawImage(img, dx, dy, drawW, drawH);

    ctx.lineWidth = BORDER_WIDTH;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  } catch {
    ctx.restore();
  }
  ctx.restore();

  // ================================
  // DRAW TEXT BOXES
  // ================================
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = BORDER_WIDTH;

  // TOP BOX
  roundedRect(ctx, leftX, topBoxY, leftW, topBoxH, BORDER_RADIUS);
  ctx.fill();
  ctx.stroke();

  // BOTTOM BOX (NOTE)
  roundedRect(ctx, leftX, bottomBoxY, leftW, bottomBoxH, BORDER_RADIUS);
  ctx.fill();
  ctx.stroke();

  // ================================
  // TEXT CONTENT
  // ================================
  const padding = 50;
  let textX = leftX + padding;
  let textY = topBoxY + padding;
  const valueX = textX + 400; // 400px column spacing

  const lineGap = 70;

  function header(label) {
    ctx.fillStyle = HEADER_COLOR;
    ctx.font = FONT_HEADER;
    ctx.fillText(label, textX, textY);
  }

  function value(label) {
    ctx.fillStyle = VALUE_COLOR;
    ctx.font = FONT_VALUE;
    ctx.fillText(label, valueX, textY);
    textY += lineGap;
  }

  // TRAINER INFO
  header('Trainer:');
  value(username);

  header('Rank:');
  value(rankName);

  textY += lineGap / 2;

  // TARGET
  header('Target:');
  value(pokemons[0] || 'None');

  header('Rarity:');
  value(rarityLabel);

  header('Reward:');
  value(rewardLabel);

  textY += lineGap / 2;

  // TIMING
  header('Start time:');
  value(startLabel);

  header('Ends:');
  value(endLabel);

  header('Duration:');
  value(durationLabel);

  // ================================
  // NOTE BOX TEXT
  // ================================
  ctx.fillStyle = VALUE_COLOR;
  ctx.font = FONT_VALUE;

  const noteX = leftX + padding;
  const noteY = bottomBoxY + padding;
  const noteMaxW = leftW - padding * 2;
  wrapText(ctx, note || 'None', noteX, noteY, noteMaxW, lineGap);

  // ================================
  // SAVE FILE
  // ================================
  const filePath = path.join(CARDS_DIR, `bounty_${bountyId}.png`);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));

  return filePath;
}

module.exports = { createBountyCard };

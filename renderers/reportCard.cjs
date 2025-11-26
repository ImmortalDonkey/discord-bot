// reportCard.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

// Optional: adjust to your real font path
try {
  registerFont(path.join(__dirname, 'fonts', 'Montserrat-Bold.ttf'), {
    family: 'Montserrat',
    weight: 'bold'
  });
  registerFont(path.join(__dirname, 'fonts', 'Montserrat-Regular.ttf'), {
    family: 'Montserrat',
    weight: 'normal'
  });
} catch {
  // If fonts missing, canvas will fall back to system fonts
}

const CARDS_DIR = path.join(__dirname, 'cards');
if (!fs.existsSync(CARDS_DIR)) fs.mkdirSync(CARDS_DIR, { recursive: true });

const SPRITES_DIR = path.join(process.cwd(), 'sprites');

// Background gradients per rarity
const rarityGradients = {
  paradox: ['#3a0b63', '#00bcd4'],
  roamerMonth: ['#e65100', '#ff4081'],
  legendary: ['#1b5e20', '#66bb6a'],
  rare: ['#0d47a1', '#42a5f5'],
  common: ['#263238', '#78909c']
};

function getGradientColors(rarityKey) {
  return rarityGradients[rarityKey] || rarityGradients.common;
}

function roundedRect(ctx, x, y, w, h, r) {
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

async function loadSprite(pokemonName) {
  const file = path.join(SPRITES_DIR, `${pokemonName}.png`);
  try {
    await fs.promises.access(file, fs.constants.R_OK);
    return await loadImage(file);
  } catch {
    return null;
  }
}

/**
 * Internal renderer for both active + expired states
 */
async function renderReportCard({
  id,
  trainerName,
  rankName,
  pokemonName,
  rarityLabel,
  rarityKey,
  points,
  routeName,
  statusText // "Available until end of the hour" or "No longer available"
}) {
  const width = 1280;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const [c1, c2] = getGradientColors(rarityKey);
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, c1);
  bgGrad.addColorStop(1, c2);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Big left panel
  const panelMargin = 30;
  const gap = 20;
  const bigPanelWidth = width * 0.6 - panelMargin * 2;
  const bigPanelHeight = height * 0.65;
  const rightPanelWidth = width * 0.35;
  const rightPanelHeight = bigPanelHeight;

  // Left big card
  ctx.fillStyle = '#07111f';
  roundedRect(ctx, panelMargin, panelMargin, bigPanelWidth, bigPanelHeight, 30);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Right sprite card
  const rightX = width - rightPanelWidth - panelMargin;
  roundedRect(ctx, rightX, panelMargin, rightPanelWidth, rightPanelHeight, 30);
  ctx.fill();
  ctx.stroke();

  // Bottom left "Available" card
  const bottomHeight = height * 0.2;
  const bottomTop = height - bottomHeight - panelMargin;
  const bottomLeftWidth = bigPanelWidth;
  const bottomRightWidth = rightPanelWidth;

  roundedRect(ctx, panelMargin, bottomTop, bottomLeftWidth, bottomHeight, 30);
  ctx.fill();
  ctx.stroke();

  // Bottom right "Route" card
  roundedRect(ctx, rightX, bottomTop, bottomRightWidth, bottomHeight, 30);
  ctx.fill();
  ctx.stroke();

  // Text styles
  ctx.textBaseline = 'top';

  // Top-left labels
  const leftPaddingX = panelMargin + 30;
  let cursorY = panelMargin + 30;

  ctx.font = 'bold 40px Montserrat, sans-serif';
  ctx.fillStyle = '#ffca28';
  ctx.fillText('Trainer:', leftPaddingX, cursorY);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px Montserrat, sans-serif';
  ctx.fillText(trainerName, leftPaddingX + 200, cursorY);

  cursorY += 55;
  ctx.fillStyle = '#ffca28';
  ctx.font = 'bold 40px Montserrat, sans-serif';
  ctx.fillText('Rank:', leftPaddingX, cursorY);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(rankName, leftPaddingX + 200, cursorY);

  // Spacer
  cursorY += 80;

  // Main sentence
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px Montserrat, sans-serif';
  const sentence = `${trainerName} has spotted a wild "${pokemonName}"!`;
  wrapText(ctx, sentence, leftPaddingX, cursorY, bigPanelWidth - 60, 50);
  cursorY += 120;

  // Rarity & points
  ctx.font = 'bold 40px Montserrat, sans-serif';
  ctx.fillStyle = '#ffca28';
  ctx.fillText('Rarity:', leftPaddingX, cursorY);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(rarityLabel, leftPaddingX + 170, cursorY);

  cursorY += 55;
  ctx.fillStyle = '#ffca28';
  ctx.fillText('Points awarded:', leftPaddingX, cursorY);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(points), leftPaddingX + 330, cursorY);

  // Bottom left text (status)
  const statusX = panelMargin + 40;
  const statusY = bottomTop + 45;
  ctx.font = 'bold 46px Montserrat, sans-serif';
  ctx.fillStyle = '#ffca28';
  ctx.fillText('Available until:', statusX, statusY);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(statusText, statusX + 360, statusY);

  // Bottom right (Route name)
  const routeX = rightX + 40;
  const routeY = bottomTop + 45;
  ctx.font = 'bold 50px Montserrat, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(routeName, routeX, routeY);

  // Sprite
  const sprite = await loadSprite(pokemonName);
  if (sprite) {
    const padding = 40;
    const boxWidth = rightPanelWidth - padding * 2;
    const boxHeight = rightPanelHeight - padding * 2;

    const spriteRatio = sprite.width / sprite.height;
    let drawW = boxWidth;
    let drawH = drawW / spriteRatio;
    if (drawH > boxHeight) {
      drawH = boxHeight;
      drawW = drawH * spriteRatio;
    }

    const sx = rightX + (rightPanelWidth - drawW) / 2;
    const sy = panelMargin + (rightPanelHeight - drawH) / 2;

    ctx.drawImage(sprite, sx, sy, drawW, drawH);
  }

  const outPath = path.join(CARDS_DIR, `report_${id}.png`);
  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(outPath, buffer);
  return outPath;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

// Public helpers
async function createReportCardActive(opts) {
  return renderReportCard({
    ...opts,
    statusText: 'End of the hour'
  });
}

async function createReportCardExpired(opts) {
  return renderReportCard({
    ...opts,
    statusText: 'No longer available'
  });
}

module.exports = {
  createReportCardActive,
  createReportCardExpired
};

// renderers/reportCard.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

// ────────────────────────────────
// Font loading (optional)
// ────────────────────────────────
try {
  registerFont(path.join(__dirname, '..', 'fonts', 'Montserrat-Bold.ttf'), {
    family: 'Montserrat',
    weight: 'bold'
  });
  registerFont(path.join(__dirname, '..', 'fonts', 'Montserrat-Regular.ttf'), {
    family: 'Montserrat',
    weight: 'normal'
  });
} catch {
  // fallback font used automatically
}

// ────────────────────────────────
// Correct paths for your file structure
// ────────────────────────────────
const CARDS_DIR = path.join(__dirname, '..', 'cards');
const SPRITES_DIR = path.join(__dirname, '..', 'sprites');

if (!fs.existsSync(CARDS_DIR)) fs.mkdirSync(CARDS_DIR, { recursive: true });

// ────────────────────────────────
// Gradient background colours per rarity
// ────────────────────────────────
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

// ────────────────────────────────
// Helpers
// ────────────────────────────────
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
    return null; // sprite missing
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const width = ctx.measureText(testLine).width;

    if (width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

// ────────────────────────────────
// CORE RENDERER (for active + expired)
// ────────────────────────────────
async function renderReportCard({
  id,
  trainerName,
  rankName,
  pokemonName,
  rarityKey,
  rarityLabel,
  points,
  routeName,
  statusText
}) {
  const width = 1280;
  const height = 720;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const [c1, c2] = getGradientColors(rarityKey);
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, c1);
  bg.addColorStop(1, c2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const margin = 30;
  const leftWidth = width * 0.6 - margin * 2;
  const leftHeight = height * 0.65;

  const rightWidth = width * 0.35;
  const rightHeight = leftHeight;
  const rightX = width - rightWidth - margin;

  // Left panel
  ctx.fillStyle = '#07111f';
  roundedRect(ctx, margin, margin, leftWidth, leftHeight, 30);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Right sprite box
  roundedRect(ctx, rightX, margin, rightWidth, rightHeight, 30);
  ctx.fill();
  ctx.stroke();

  // Bottom panels
  const bottomHeight = height * 0.2;
  const bottomY = height - bottomHeight - margin;

  roundedRect(ctx, margin, bottomY, leftWidth, bottomHeight, 30);
  ctx.fill();
  ctx.stroke();

  roundedRect(ctx, rightX, bottomY, rightWidth, bottomHeight, 30);
  ctx.fill();
  ctx.stroke();

  // TEXT
  const leftPad = margin + 30;
  let y = margin + 30;

  ctx.font = 'bold 40px Montserrat';
  ctx.fillStyle = '#ffca28';
  ctx.fillText('Trainer:', leftPad, y);

  ctx.fillStyle = '#fff';
  ctx.fillText(trainerName, leftPad + 200, y);

  y += 55;
  ctx.fillStyle = '#ffca28';
  ctx.fillText('Rank:', leftPad, y);

  ctx.fillStyle = '#fff';
  ctx.fillText(rankName, leftPad + 200, y);

  y += 80;
  ctx.font = 'bold 42px Montserrat';
  ctx.fillStyle = '#fff';
  wrapText(
    ctx,
    `${trainerName} has spotted a wild "${pokemonName}"!`,
    leftPad,
    y,
    leftWidth - 60,
    50
  );

  y += 120;
  ctx.font = 'bold 40px Montserrat';
  ctx.fillStyle = '#ffca28';
  ctx.fillText('Rarity:', leftPad, y);

  ctx.fillStyle = '#fff';
  ctx.fillText(rarityLabel, leftPad + 170, y);

  y += 55;
  ctx.fillStyle = '#ffca28';
  ctx.fillText('Points awarded:', leftPad, y);

  ctx.fillStyle = '#fff';
  ctx.fillText(String(points), leftPad + 330, y);

  // Bottom left — availability
  ctx.font = 'bold 46px Montserrat';
  ctx.fillStyle = '#ffca28';
  ctx.fillText('Available until:', margin + 40, bottomY + 45);

  ctx.fillStyle = '#fff';
  ctx.fillText(statusText, margin + 360, bottomY + 45);

  // Bottom right — route
  ctx.font = 'bold 50px Montserrat';
  ctx.fillStyle = '#fff';
  ctx.fillText(routeName, rightX + 40, bottomY + 45);

  // Sprite
  const sprite = await loadSprite(pokemonName);
  if (sprite) {
    const pad = 40;
    const boxW = rightWidth - pad * 2;
    const boxH = rightHeight - pad * 2;
    const ratio = sprite.width / sprite.height;

    let w = boxW;
    let h = w / ratio;

    if (h > boxH) {
      h = boxH;
      w = h * ratio;
    }

    const dx = rightX + (rightWidth - w) / 2;
    const dy = margin + (rightHeight - h) / 2;

    ctx.drawImage(sprite, dx, dy, w, h);
  }

  // Save PNG
  const out = path.join(CARDS_DIR, `report_${id}.png`);
  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(out, buffer);

  return out;
}

// PUBLIC FUNCTIONS
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

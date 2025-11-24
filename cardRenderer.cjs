// cardRenderer.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// -------------------------------------------------
// FINAL DIMENSIONS (B-style layout)
// -------------------------------------------------
const CARD_WIDTH = 1800;     // wider
const CARD_HEIGHT = 1000;    // taller
const MARGIN = 60;

// Bigger left area, narrower right area:
const RIGHT_WIDTH = 480;     // image column
const CARDS_DIR = path.join(__dirname, 'card-images');

if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

// -------------------------------------------------
// RARITY STYLES
// -------------------------------------------------
const rarityStyles = {
  paradox: {
    gradientFrom: '#3b82f6',
    gradientTo: '#a855f7',
    boxColor: 'rgba(15,23,42,0.92)'
  },
  roamerMonth: {
    gradientFrom: '#f59e0b',
    gradientTo: '#ea580c',
    boxColor: 'rgba(17,24,39,0.92)'
  },
  legendary: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee',
    boxColor: 'rgba(15,23,42,0.92)'
  },
  rare: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee',
    boxColor: 'rgba(15,23,42,0.92)'
  },
  common: {
    gradientFrom: '#16a34a',
    gradientTo: '#0f766e',
    boxColor: 'rgba(5,46,22,0.92)'
  }
};

function getStyleForRarity(key) {
  return rarityStyles[key] || rarityStyles.common;
}

// -------------------------------------------------
// UTIL — Rounded Rectangle
// -------------------------------------------------
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

// -------------------------------------------------
// BOX DRAWER (50px title, 40px bold text)
// -------------------------------------------------
function drawBox(ctx, x, y, w, h, bgColor, title, lines) {
  const paddingX = 32;
  const paddingY = 32;
  const lineSpacing = 56;

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 30);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.clip();

  // Title
  ctx.fillStyle = '#e5e7eb';
  ctx.font = 'bold 50px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(title, x + paddingX, y + paddingY);

  // Body
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = '#f9fafb';

  let currentY = y + paddingY + 80;
  const maxWidth = w - paddingX * 2;

  for (const raw of lines) {
    const text = raw || '';

    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x + paddingX, currentY);
      currentY += lineSpacing;
    } else {
      let words = text.split(' ');
      let current = '';
      for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth) {
          ctx.fillText(current, x + paddingX, currentY);
          current = word;
          currentY += lineSpacing;
        } else {
          current = test;
        }
      }
      if (current) {
        ctx.fillText(current, x + paddingX, currentY);
        currentY += lineSpacing;
      }
    }
  }

  ctx.restore();
}

// -------------------------------------------------
// MAIN RENDER FUNCTION
// -------------------------------------------------
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

  // Background
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  gradient.addColorStop(0, style.gradientFrom);
  gradient.addColorStop(1, style.gradientTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Overlay
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Layout
  const leftX = MARGIN;
  const leftY = MARGIN;
  const leftWidth = CARD_WIDTH - RIGHT_WIDTH - MARGIN * 3;
  const leftHeight = CARD_HEIGHT - MARGIN * 2;

  const rightX = leftX + leftWidth + MARGIN;
  const rightY = MARGIN;
  const rightSize = CARD_HEIGHT - MARGIN * 2;

  // -------------------------------------------------
  // RIGHT IMAGE (fully centered, no cutoff)
  // -------------------------------------------------
  ctx.save();
  try {
    const img = await loadImage(avatarUrl);

    const aspect = img.width / img.height;
    let drawW = rightSize;
    let drawH = rightSize;

    if (aspect > 1) {
      drawH = rightSize / aspect;
    } else {
      drawW = rightSize * aspect;
    }

    const cx = rightX + (rightSize - drawW) / 2;
    const cy = rightY + (rightSize - drawH) / 2;

    roundedRectPath(ctx, rightX, rightY, rightSize, rightSize, 50);
    ctx.clip();
    ctx.drawImage(img, cx, cy, drawW, drawH);

    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(248,250,252,0.9)';
    ctx.stroke();
  } catch (err) {
    roundedRectPath(ctx, rightX, rightY, rightSize, rightSize, 50);
    ctx.clip();
    ctx.fillStyle = 'rgba(15,23,42,0.9)';
    ctx.fillRect(rightX, rightY, rightSize, rightSize);

    ctx.font = 'bold 50px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No Image', rightX + rightSize / 2, rightY + rightSize / 2);
  }
  ctx.restore();
  ctx.textAlign = 'left';

  // -------------------------------------------------
  // LEFT-SIDE BOXES (5 rows)
  // -------------------------------------------------
  const boxCount = 5;
  const gap = 22;
  const totalGap = gap * (boxCount - 1);
  const boxHeight = (leftHeight - totalGap) / boxCount;

  const boxColor = style.boxColor;
  let y = leftY;

  drawBox(ctx, leftX, y, leftWidth, boxHeight, boxColor, "Trainer Info", [
    `Trainer: ${username}`,
    `Rank: ${rankName}`,
    `Rarity: ${rarityLabel}`
  ]);
  y += boxHeight + gap;

  drawBox(ctx, leftX, y, leftWidth, boxHeight, boxColor, "Reward", [
    rewardLabel
  ]);
  y += boxHeight + gap;

  drawBox(ctx, leftX, y, leftWidth, boxHeight, boxColor, "Pokémon Targets",
    pokemons.length ? pokemons.map(p => `• ${p}`) : ["None"]);
  y += boxHeight + gap;

  drawBox(ctx, leftX, y, leftWidth, boxHeight, boxColor, "Timing", [
    `Start: ${startLabel}`,
    `End: ${endLabel}`,
    `Duration: ${durationLabel}`
  ]);
  y += boxHeight + gap;

  drawBox(ctx, leftX, y, leftWidth, boxHeight, boxColor, "Note", [
    note || "None"
  ]);

  // Save
  const dest = path.join(CARDS_DIR, `bounty_${bountyId}.png`);
  fs.writeFileSync(dest, canvas.toBuffer('image/png'));
  return dest;
}

module.exports = { createBountyCard };

// cardRenderer.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// MUCH larger card resolution to stop clipping
const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;

const MARGIN = 60;
const RIGHT_WIDTH = 700; // wider so the image isn't cut

const CARDS_DIR = path.join(__dirname, 'card-images');

// Ensure output folder exists
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

// Rarity styles
const rarityStyles = {
  paradox: {
    gradientFrom: '#3b82f6',
    gradientTo: '#a855f7',
    boxColor: 'rgba(15, 23, 42, 0.92)'
  },
  roamerMonth: {
    gradientFrom: '#f59e0b',
    gradientTo: '#ea580c',
    boxColor: 'rgba(17, 24, 39, 0.92)'
  },
  legendary: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee',
    boxColor: 'rgba(15, 23, 42, 0.92)'
  },
  rare: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee',
    boxColor: 'rgba(15, 23, 42, 0.92)'
  },
  common: {
    gradientFrom: '#16a34a',
    gradientTo: '#0f766e',
    boxColor: 'rgba(5, 46, 22, 0.92)'
  }
};

function getStyleForRarity(key) {
  return rarityStyles[key] || rarityStyles.common;
}

// Rounded rectangle helper
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

function drawBox(ctx, x, y, w, h, bgColor, title, lines) {
  const paddingX = 40;
  const paddingY = 40;
  const lineSpacing = 58;

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 40);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.clip();

  // Title (50px bold)
  ctx.fillStyle = '#e5e7eb';
  ctx.font = 'bold 50px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(title, x + paddingX, y + paddingY);

  // Content (40px bold)
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = '#f9fafb';

  let currentY = y + paddingY + 70;
  const maxWidth = w - paddingX * 2;

  for (const raw of lines) {
    const text = raw || '';

    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x + paddingX, currentY);
      currentY += lineSpacing;
    } else {
      // Manual word-wrap
      let words = text.split(' ');
      let line = '';
      for (const word of words) {
        const test = (line ? line + ' ' : '') + word;
        if (ctx.measureText(test).width > maxWidth) {
          ctx.fillText(line, x + paddingX, currentY);
          currentY += lineSpacing;
          line = word;
        } else line = test;
      }
      if (line) {
        ctx.fillText(line, x + paddingX, currentY);
        currentY += lineSpacing;
      }
    }
  }

  ctx.restore();
}

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

  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  gradient.addColorStop(0, style.gradientFrom);
  gradient.addColorStop(1, style.gradientTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Layout
  const leftWidth = CARD_WIDTH - RIGHT_WIDTH - MARGIN * 3;
  const leftHeight = CARD_HEIGHT - MARGIN * 2;
  const leftX = MARGIN;
  const leftY = MARGIN;

  const rightX = leftX + leftWidth + MARGIN;
  const rightY = MARGIN;
  const rightSize = CARD_HEIGHT - MARGIN * 2;

  // RIGHT IMAGE (no cropping)
  ctx.save();
  try {
    const img = await loadImage(avatarUrl);
    const aspect = img.width / img.height;

    let drawW = rightSize;
    let drawH = rightSize;

    if (aspect > 1) drawH = rightSize / aspect;
    else drawW = rightSize * aspect;

    const cx = rightX + (rightSize - drawW) / 2;
    const cy = rightY + (rightSize - drawH) / 2;

    roundedRectPath(ctx, rightX, rightY, rightSize, rightSize, 50);
    ctx.clip();
    ctx.drawImage(img, cx, cy, drawW, drawH);

    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(248,250,252,0.92)';
    ctx.stroke();
  } catch (err) {
    // fallback
  }
  ctx.restore();

  // Spacing for 5 bigger boxes
  const boxCount = 5;
  const gap = 28;
  const totalGap = gap * (boxCount - 1);
  const boxHeight = (leftHeight - totalGap) / boxCount;

  let y = leftY;
  const bgBoxColor = style.boxColor;

  drawBox(ctx, leftX, y, leftWidth, boxHeight, bgBoxColor,
    "Trainer Info", [
      `Trainer: ${username}`,
      `Rank: ${rankName}`,
      `Rarity: ${rarityLabel}`
    ]
  );
  y += boxHeight + gap;

  drawBox(ctx, leftX, y, leftWidth, boxHeight, bgBoxColor,
    "Reward", [rewardLabel]
  );
  y += boxHeight + gap;

  drawBox(ctx, leftX, y, leftWidth, boxHeight, bgBoxColor,
    "Pokémon Targets",
    pokemons.length ? pokemons.map(p => `• ${p}`) : ["None"]
  );
  y += boxHeight + gap;

  drawBox(ctx, leftX, y, leftWidth, boxHeight, bgBoxColor,
    "Timing", [
      `Start: ${startLabel}`,
      `End: ${endLabel}`,
      `Duration: ${durationLabel}`
    ]
  );
  y += boxHeight + gap;

  drawBox(ctx, leftX, y, leftWidth, boxHeight, bgBoxColor,
    "Note", [note || "None"]
  );

  const filePath = path.join(CARDS_DIR, `bounty_${bountyId}.png`);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  return filePath;
}

module.exports = { createBountyCard };

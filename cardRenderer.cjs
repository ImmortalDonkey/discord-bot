// cardRenderer.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 600;
const MARGIN = 40;
const RIGHT_WIDTH = 360; // area for avatar/card image

const CARDS_DIR = path.join(__dirname, 'card-images');

// Ensure output folder exists
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

// Rarity styles: gradient + box colour
const rarityStyles = {
  paradox: {
    gradientFrom: '#3b82f6', // blue
    gradientTo: '#a855f7',   // purple
    boxColor: 'rgba(15, 23, 42, 0.95)' // slate-ish
  },
  roamerMonth: {
    gradientFrom: '#f59e0b', // amber
    gradientTo: '#ea580c',   // orange
    boxColor: 'rgba(17, 24, 39, 0.95)'
  },
  legendary: {
    gradientFrom: '#1d4ed8', // blue
    gradientTo: '#22d3ee',   // cyan
    boxColor: 'rgba(15, 23, 42, 0.95)'
  },
  rare: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee',
    boxColor: 'rgba(15, 23, 42, 0.95)'
  },
  common: {
    gradientFrom: '#16a34a', // green
    gradientTo: '#0f766e',   // teal
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

function drawBox(ctx, x, y, w, h, bgColor, title, lines) {
  // Background box
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 18);
  ctx.fillStyle = bgColor;
  ctx.fill();

  ctx.clip();

  const paddingX = 18;
  const paddingTop = 20;
  const lineSpacing = 26;

  // Title
  ctx.fillStyle = '#e5e7eb';
  ctx.font = 'bold 26px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(title, x + paddingX, y + paddingTop);

  // Content
  ctx.font = '22px sans-serif';
  ctx.fillStyle = '#f9fafb';

  let currentY = y + paddingTop + 32;
  const maxWidth = w - paddingX * 2;

  for (const line of lines) {
    const text = line || '';
    // simple wrap if needed
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x + paddingX, currentY);
      currentY += lineSpacing;
    } else {
      let words = text.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (ctx.measureText(testLine).width > maxWidth) {
          ctx.fillText(currentLine, x + paddingX, currentY);
          currentLine = word;
          currentY += lineSpacing;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        ctx.fillText(currentLine, x + paddingX, currentY);
        currentY += lineSpacing;
      }
    }
  }

  ctx.restore();
}

/**
 * options:
 *  - bountyId
 *  - username
 *  - rankName
 *  - rarityKey ('paradox','roamerMonth','legendary','rare','common')
 *  - rarityLabel (display text)
 *  - pokemons: array of strings
 *  - startLabel
 *  - endLabel
 *  - durationLabel
 *  - note
 *  - rewardLabel
 *  - avatarUrl (string)
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

  // Slight dark overlay for contrast
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Layout
  const leftX = MARGIN;
  const leftY = MARGIN;
  const leftWidth = CARD_WIDTH - RIGHT_WIDTH - MARGIN * 3;
  const leftHeight = CARD_HEIGHT - MARGIN * 2;

  const rightX = leftX + leftWidth + MARGIN;
  const rightY = MARGIN;
  const rightSize = CARD_HEIGHT - MARGIN * 2;

  // Draw avatar/card image on the right
  ctx.save();
  try {
    const img = await loadImage(avatarUrl);
    roundedRectPath(ctx, rightX, rightY, rightSize, rightSize, 40);
    ctx.clip();
    ctx.drawImage(img, rightX, rightY, rightSize, rightSize);

    // Border
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.9)';
    ctx.stroke();
  } catch (err) {
    // Fallback: simple placeholder
    roundedRectPath(ctx, rightX, rightY, rightSize, rightSize, 40);
    ctx.clip();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(rightX, rightY, rightSize, rightSize);

    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#e5e7eb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No Card', rightX + rightSize / 2, rightY + rightSize / 2);
  }
  ctx.restore();
  ctx.textAlign = 'left';

  // Divide left side into 5 boxes, evenly
  const boxCount = 5;
  const gap = 12;
  const totalGap = gap * (boxCount - 1);
  const boxHeight = (leftHeight - totalGap) / boxCount;

  const bgBoxColor = style.boxColor;

  let currentY = leftY;

  // Box 1: Trainer / Rank / Rarity
  const trainerLines = [
    `Trainer: ${username}`,
    `Rank: ${rankName}`,
    `Rarity: ${rarityLabel}`
  ];
  drawBox(
    ctx,
    leftX,
    currentY,
    leftWidth,
    boxHeight,
    bgBoxColor,
    'Trainer Info',
    trainerLines
  );
  currentY += boxHeight + gap;

  // Box 2: Reward
  const rewardLines = [rewardLabel];
  drawBox(
    ctx,
    leftX,
    currentY,
    leftWidth,
    boxHeight,
    bgBoxColor,
    'Reward',
    rewardLines
  );
  currentY += boxHeight + gap;

  // Box 3: Pokémon Targets
  const pokemonLines = pokemons.length
    ? pokemons.map(p => `• ${p}`)
    : ['None'];
  drawBox(
    ctx,
    leftX,
    currentY,
    leftWidth,
    boxHeight,
    bgBoxColor,
    'Pokémon Targets',
    pokemonLines
  );
  currentY += boxHeight + gap;

  // Box 4: Time / Duration
  const timeLines = [
    `Start: ${startLabel}`,
    `End: ${endLabel}`,
    `Duration: ${durationLabel}`
  ];
  drawBox(
    ctx,
    leftX,
    currentY,
    leftWidth,
    boxHeight,
    bgBoxColor,
    'Timing',
    timeLines
  );
  currentY += boxHeight + gap;

  // Box 5: Note
  const noteLines = [note || 'None'];
  drawBox(
    ctx,
    leftX,
    currentY,
    leftWidth,
    boxHeight,
    bgBoxColor,
    'Note',
    noteLines
  );

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

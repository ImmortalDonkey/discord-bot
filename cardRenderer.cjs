// cardRenderer.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const CARD_WIDTH = 1920;
const CARD_HEIGHT = 1080;
const MARGIN = 40;

// Layout ratios
const TEXT_RATIO = 0.6; // 60% text, 40% image

// Directories
const CARDS_DIR = path.join(__dirname, 'card-images');
const SPRITES_DIR = path.join(__dirname, 'sprites');

// Ensure output folder exists
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

// Rarity styles: gradient + box colour
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

// Get sprite path for a given Pokémon name (exact match with .png)
function getSpritePath(pokemonName) {
  if (!pokemonName) return null;
  const clean = pokemonName.trim();
  if (!clean) return null;
  const fileName = `${clean}.png`;
  return path.join(SPRITES_DIR, fileName);
}

/**
 * Expand logical lines (header/value/spacer) into physical lines with wrapping.
 */
function layoutInfoLines(ctx, lines, maxTextWidth, headerValueGap, lineHeight) {
  // We assume font already set to 'bold 58px sans-serif' before calling this.

  // 1) Find max header width
  let maxHeaderWidth = 0;
  for (const ln of lines) {
    if (ln.type === 'spacer') continue;
    const headerText = ln.header || '';
    const w = ctx.measureText(headerText).width;
    if (w > maxHeaderWidth) maxHeaderWidth = w;
  }

  const valueMaxWidth = maxTextWidth - maxHeaderWidth - headerValueGap;
  const physicalLines = [];
  let totalHeight = 0;

  for (const ln of lines) {
    if (ln.type === 'spacer') {
      physicalLines.push({
        type: 'spacer'
      });
      totalHeight += lineHeight; // blank line height
      continue;
    }

    const headerText = ln.header || '';
    const valueText = ln.value || '';

    // Word-wrap the value
    const words = valueText.split(' ');
    let current = '';
    let firstLine = true;

    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      const testWidth = ctx.measureText(test).width;

      if (testWidth > valueMaxWidth && current) {
        // push current line
        physicalLines.push({
          type: 'text',
          header: firstLine ? headerText : '',
          value: current
        });
        totalHeight += lineHeight;

        current = word;
        firstLine = false;
      } else {
        current = test;
      }
    }

    // remaining
    if (current) {
      physicalLines.push({
        type: 'text',
        header: firstLine ? headerText : '',
        value: current
      });
      totalHeight += lineHeight;
    }
  }

  return {
    lines: physicalLines,
    maxHeaderWidth,
    totalHeight
  };
}

/**
 * Draw the main info box with:
 * - headers in bright gold (#facc15)
 * - values in white
 * - 58px bold font
 * - fixed header column, ~50px gap
 * - vertically centered text in the box
 */
function drawInfoBox(ctx, x, y, w, h, bgColor, infoConfig) {
  const paddingX = 40;
  const paddingY = 40;
  const lineHeight = 62; // spacing between text lines
  const headerValueGap = 50;
  const radius = 26;

  // Background + border
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.95)'; // white-ish border
  ctx.stroke();
  ctx.clip();

  // Use a single font size for everything
  ctx.font = 'bold 58px sans-serif';
  ctx.textBaseline = 'top';

  // Build logical lines
  const {
    username,
    rankName,
    rarityLabel,
    rewardLabel,
    pokemons,
    startLabel,
    endLabel,
    durationLabel
  } = infoConfig;

  const pokemonList = Array.isArray(pokemons) ? pokemons : [];
  const targets = pokemonList.length ? pokemonList : ['None'];

  const logicalLines = [];

  // Trainer + Rank
  logicalLines.push({ header: 'Trainer:', value: username || 'Unknown' });
  logicalLines.push({ header: 'Rank:', value: rankName || 'Unknown' });
  logicalLines.push({ type: 'spacer' });

  // Targets
  targets.forEach((p, index) => {
    logicalLines.push({
      header: index === 0 ? 'Target:' : '',
      value: p
    });
  });

  logicalLines.push({ header: 'Rarity:', value: rarityLabel || 'Unknown' });
  logicalLines.push({ header: 'Reward:', value: rewardLabel || '0 PKD' });
  logicalLines.push({ type: 'spacer' });

  // Time
  logicalLines.push({ header: 'Start time:', value: startLabel || '' });
  logicalLines.push({ header: 'Ends:', value: endLabel || '' });
  logicalLines.push({ header: 'Duration:', value: durationLabel || '' });

  // Layout (measure + wrap)
  const innerWidth = w - paddingX * 2;
  const { lines, maxHeaderWidth, totalHeight } = layoutInfoLines(
    ctx,
    logicalLines,
    innerWidth,
    headerValueGap,
    lineHeight
  );

  // Vertical centering
  const availableHeight = h - paddingY * 2;
  const offsetY = Math.max(0, (availableHeight - totalHeight) / 2);
  let currentY = y + paddingY + offsetY;

  const headerX = x + paddingX;
  const valueX = headerX + maxHeaderWidth + headerValueGap;

  // Draw all physical lines
  for (const ln of lines) {
    if (ln.type === 'spacer') {
      currentY += lineHeight;
      continue;
    }

    // Header in gold
    if (ln.header) {
      ctx.fillStyle = '#facc15'; // bright gold
      ctx.fillText(ln.header, headerX, currentY);
    }

    // Value in white
    if (ln.value) {
      ctx.fillStyle = '#f9fafb';
      ctx.fillText(ln.value, valueX, currentY);
    }

    currentY += lineHeight;
  }

  ctx.restore();
}

/**
 * Draw note box: no header, just note text centered vertically.
 */
function drawNoteBox(ctx, x, y, w, h, bgColor, noteText) {
  const paddingX = 40;
  const paddingY = 30;
  const lineHeight = 62;
  const radius = 26;

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.95)'; // white-ish border
  ctx.stroke();
  ctx.clip();

  ctx.font = 'bold 58px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f9fafb';

  const text = noteText && noteText.trim() ? noteText.trim() : 'None';

  // Word-wrap for note
  const innerWidth = w - paddingX * 2;
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > innerWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  // Ensure at least 2 lines space wise
  const displayLines = lines.length === 0 ? [''] : lines;
  const contentHeight = displayLines.length * lineHeight;

  const availableHeight = h - paddingY * 2;
  const offsetY = Math.max(0, (availableHeight - contentHeight) / 2);
  let currentY = y + paddingY + offsetY;

  for (const ln of displayLines) {
    ctx.fillText(ln, x + paddingX, currentY);
    currentY += lineHeight;
  }

  ctx.restore();
}

/**
 * Draw up to 3 Pokémon sprites on the right, in a square area:
 * - 1 sprite: middle slot
 * - 2 sprites: top & bottom slots
 * - 3 sprites: all slots
 */
async function drawPokemonSprites(ctx, rightX, rightY, rightWidth, rightHeight, pokemons, bgColor) {
  const radius = 40;
  const count = Math.min(3, (pokemons || []).length);
  if (count <= 0) return;

  // Slots
  const slots = 3;
  const slotHeight = rightHeight / slots;

  // Decide which slot indices to use (0,1,2)
  let usedSlots;
  if (count === 1) {
    usedSlots = [1]; // middle
  } else if (count === 2) {
    usedSlots = [0, 2]; // top and bottom
  } else {
    usedSlots = [0, 1, 2]; // all
  }

  const spritePadding = 30;
  const squareSize = Math.min(
    rightWidth - spritePadding * 2,
    slotHeight - spritePadding * 2
  );

  for (let i = 0; i < count; i++) {
    const name = pokemons[i];
    const spritePath = getSpritePath(name);
    const slotIndex = usedSlots[i];

    const slotTop = rightY + slotIndex * slotHeight;
    const boxX = rightX + (rightWidth - squareSize) / 2;
    const boxY = slotTop + (slotHeight - squareSize) / 2;

    ctx.save();
    roundedRectPath(ctx, boxX, boxY, squareSize, squareSize, radius);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.95)'; // white-ish border
    ctx.stroke();
    ctx.clip();

    if (spritePath && fs.existsSync(spritePath)) {
      try {
        const img = await loadImage(spritePath);
        const aspect = img.width / img.height;
        let drawW = squareSize;
        let drawH = squareSize;

        if (aspect > 1) {
          // wider than tall
          drawH = squareSize / aspect;
        } else {
          // taller than wide
          drawW = squareSize * aspect;
        }

        const dx = boxX + (squareSize - drawW) / 2;
        const dy = boxY + (squareSize - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);
      } catch (err) {
        // fallback text if load fails
        ctx.fillStyle = '#e5e7eb';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Sprite error', boxX + squareSize / 2, boxY + squareSize / 2);
      }
    } else {
      // fallback "No Sprite"
      ctx.fillStyle = '#e5e7eb';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No Sprite', boxX + squareSize / 2, boxY + squareSize / 2);
    }

    ctx.restore();
  }
}

/**
 * options:
 *  - bountyId
 *  - username
 *  - rankName
 *  - rarityKey
 *  - rarityLabel
 *  - pokemons[] (up to 3 used for sprites & text)
 *  - startLabel
 *  - endLabel
 *  - durationLabel
 *  - note
 *  - rewardLabel
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
    pokemons = [],
    startLabel,
    endLabel,
    durationLabel,
    note,
    rewardLabel
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

  // Slight dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Layout calculations
  const innerWidth = CARD_WIDTH - MARGIN * 3;
  const textWidth = innerWidth * TEXT_RATIO;
  const imageWidth = innerWidth * (1 - TEXT_RATIO);

  const leftX = MARGIN;
  const leftY = MARGIN;
  const leftWidth = textWidth;
  const leftHeight = CARD_HEIGHT - MARGIN * 2;

  const rightX = leftX + leftWidth + MARGIN;
  const rightY = MARGIN;
  const rightWidth = imageWidth;
  const rightHeight = leftHeight;

  // Top & bottom box heights (80% / 20% ratio)
  const boxGap = 24;
  const infoBoxHeight = leftHeight * 0.8;
  const noteBoxHeight = leftHeight - infoBoxHeight - boxGap;

  // Draw info box
  drawInfoBox(ctx, leftX, leftY, leftWidth, infoBoxHeight, style.boxColor, {
    username,
    rankName,
    rarityLabel,
    rewardLabel,
    pokemons,
    startLabel,
    endLabel,
    durationLabel
  });

  // Draw note box
  drawNoteBox(
    ctx,
    leftX,
    leftY + infoBoxHeight + boxGap,
    leftWidth,
    noteBoxHeight,
    style.boxColor,
    note || ''
  );

  // Draw Pokémon sprites on right
  await drawPokemonSprites(ctx, rightX, rightY, rightWidth, rightHeight, pokemons, 'rgba(15, 23, 42, 0.9)');

  // Save image
  const filePath = path.join(CARDS_DIR, `bounty_${bountyId}.png`);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  return filePath;
}

module.exports = { createBountyCard };

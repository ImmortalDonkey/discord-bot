// renderers/cardRenderer.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;
const MARGIN = 40;

// NOTE: card images saved here
const CARDS_DIR = path.join(__dirname, 'card-images');
// NOTE: sprites are in the root /sprites folder (one level up)
const SPRITES_DIR = path.join(__dirname, '..', 'sprites');

// Ensure output folder exists
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

// Rarity styles: gradient + box colour
const rarityStyles = {
  paradox: {
    gradientFrom: '#3b82f6',
    gradientTo: '#a855f7',
    boxColor: 'rgba(15, 23, 42, 0.95)'
  },
  roamerMonth: {
    gradientFrom: '#f97316',
    gradientTo: '#ec4899',
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

// Simple word-wrap helper
function wrapText(ctx, text, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push('');
  return lines;
}

// Map a Pokémon name to its sprite path
function getSpritePathForPokemon(pokemonName) {
  if (!pokemonName) return null;
  const fileName = `${pokemonName}.png`; // e.g. "Walking Wake.png"
  return path.join(SPRITES_DIR, fileName);
}

// Draw a single sprite box (with image if found)
async function drawSpriteBox(ctx, x, y, size, pokemonName) {
  ctx.save();
  roundedRectPath(ctx, x, y, size, size, 30);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.98)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#f9fafb';
  ctx.stroke();

  const spritePath = getSpritePathForPokemon(pokemonName);
  let img = null;
  try {
    if (spritePath && fs.existsSync(spritePath)) {
      img = await loadImage(spritePath);
    }
  } catch {
    img = null;
  }

  if (img) {
    const pad = size * 0.12;
    const maxW = size - pad * 2;
    const maxH = size - pad * 2;
    const aspect = img.width / img.height;

    let drawW = maxW;
    let drawH = maxH;
    if (aspect > 1) {
      // Wider than tall
      drawW = maxW;
      drawH = maxW / aspect;
    } else {
      drawH = maxH;
      drawW = maxH * aspect;
    }

    const dx = x + (size - drawW) / 2;
    const dy = y + (size - drawH) / 2;
    ctx.drawImage(img, dx, dy, drawW, drawH);
  } else {
    // Fallback text
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#e5e7eb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No Sprite', x + size / 2, y + size / 2);
  }

  ctx.restore();
}

/**
 * options:
 *  - bountyId
 *  - username         // server nickname preferred
 *  - rankName
 *  - rarityKey
 *  - rarityLabel
 *  - pokemons[]       // up to 3 shown as sprites
 *  - startLabel
 *  - endLabel
 *  - durationLabel
 *  - note
 *  - rewardLabel
 *  - avatarUrl
 *
 * Returns: Buffer (PNG) and also saves a copy into /renderers/card-images
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
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, style.gradientFrom);
  gradient.addColorStop(1, style.gradientTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Slight dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Layout: left text column (≈60%), right image column (≈40%)
  const totalInnerWidth = CARD_WIDTH - MARGIN * 3;
  const rightMaxWidth = totalInnerWidth * 0.4;
  const rightMaxHeight = CARD_HEIGHT - 2 * MARGIN;
  const imageSize = Math.min(rightMaxWidth, rightMaxHeight);

  const rightX = CARD_WIDTH - MARGIN - imageSize;
  const rightY = MARGIN;

  const leftX = MARGIN;
  const leftY = MARGIN;
  const leftWidth = rightX - leftX - MARGIN;
  const leftHeight = CARD_HEIGHT - 2 * MARGIN;

  // Draw right avatar square
  ctx.save();
  try {
    const img = await loadImage(avatarUrl);

    const imgAspect = img.width / img.height;
    let drawW = imageSize;
    let drawH = imageSize;

    if (imgAspect > 1) {
      drawH = imageSize / imgAspect;
    } else {
      drawW = imageSize * imgAspect;
    }

    const cx = rightX + (imageSize - drawW) / 2;
    const cy = rightY + (imageSize - drawH) / 2;

    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.clip();
    ctx.drawImage(img, cx, cy, drawW, drawH);

    ctx.restore();
    ctx.save();
    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.9)';
    ctx.stroke();
  } catch {
    ctx.restore();
    ctx.save();
    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.clip();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(rightX, rightY, imageSize, imageSize);
    ctx.font = 'bold 42px sans-serif';
    ctx.fillStyle = '#e5e7eb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No Image', rightX + imageSize / 2, rightY + imageSize / 2);
    ctx.restore();
    ctx.save();
    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.9)';
    ctx.stroke();
  }
  ctx.restore();

  // Left column: info + note boxes (stacked)
  const boxGap = 40;
  const FONT_SIZE = 55;
  const lineHeight = FONT_SIZE * 1.25;
  const groupSpacing = lineHeight * 0.7;
  const labelColor = '#facc15';
  const valueColor = '#f9fafb';

  const pokemonList = Array.isArray(pokemons) && pokemons.length ? pokemons : ['None'];

  const infoRows = [];
  infoRows.push({ label: 'Trainer:', value: username });
  infoRows.push({ label: 'Rank:', value: rankName });
  infoRows.push({ spacer: true });

  // First Pokémon line with label "Target:"
  infoRows.push({ label: 'Target:', value: pokemonList[0] });

  // Additional Pokémon lines with aligned value only
  for (let i = 1; i < pokemonList.length; i++) {
    infoRows.push({ label: '', value: pokemonList[i] });
  }

  infoRows.push({ label: 'Rarity:', value: rarityLabel });
  infoRows.push({ label: 'Reward:', value: rewardLabel });
  infoRows.push({ spacer: true });

  infoRows.push({ label: 'Start time:', value: startLabel });
  infoRows.push({ label: 'Ends:', value: endLabel });
  infoRows.push({ label: 'Duration:', value: durationLabel });

  // Count rows for vertical size calculation
  const nonSpacerRows = infoRows.filter(r => !r.spacer).length;
  const spacerCount = infoRows.filter(r => r.spacer).length;

  const infoPaddingX = 50;
  const infoPaddingY = 50;
  const notePaddingX = 50;
  const notePaddingY = 40;

  // NOTE: wrap note text first
  const noteText = note || 'Good luck!';
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const maxNoteTextWidth = leftWidth - notePaddingX * 2;
  const noteLines = wrapText(ctx, noteText, maxNoteTextWidth, lineHeight);
  const noteTextHeight = noteLines.length * lineHeight;
  const noteMinHeight = notePaddingY * 2 + lineHeight * 2;
  const noteNeededHeight = notePaddingY * 2 + noteTextHeight;
  const noteBoxHeight = Math.max(noteMinHeight, noteNeededHeight);

  const infoTextHeight =
    nonSpacerRows * lineHeight + spacerCount * groupSpacing;
  const infoNeededHeight = infoPaddingY * 2 + infoTextHeight;

  const leftAvailableForInfo = leftHeight - boxGap - noteBoxHeight;
  const infoBoxHeight = Math.max(
    infoNeededHeight,
    Math.min(leftAvailableForInfo, leftHeight * 0.9)
  );

  const infoBoxX = leftX;
  const infoBoxY = leftY;
  const infoBoxW = leftWidth;
  const infoBoxH = infoBoxHeight;

  const noteBoxX = leftX;
  const noteBoxY = infoBoxY + infoBoxH + boxGap;
  const noteBoxW = leftWidth;
  const noteBoxH = leftHeight - infoBoxH - boxGap;

  // Draw top info box
  ctx.save();
  roundedRectPath(ctx, infoBoxX, infoBoxY, infoBoxW, infoBoxH, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#f9fafb';
  ctx.stroke();
  ctx.restore();

  // Compute label column width
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  const labelsToMeasure = infoRows
    .filter(r => !r.spacer && r.label)
    .map(r => r.label);
  let maxLabelWidth = 0;
  for (const lab of labelsToMeasure) {
    const w = ctx.measureText(lab).width;
    if (w > maxLabelWidth) maxLabelWidth = w;
  }

  const labelGap = 50;
  const labelX = infoBoxX + infoPaddingX;
  const valueX = labelX + maxLabelWidth + labelGap;

  // Vertically centre text inside top info box
  const infoTextTotalHeight =
    nonSpacerRows * lineHeight + spacerCount * groupSpacing;
  const centeredStartY = infoBoxY + (infoBoxH - infoTextTotalHeight) / 2;
  let currentY = centeredStartY;

  for (const row of infoRows) {
    if (row.spacer) {
      currentY += groupSpacing;
      continue;
    }

    ctx.fillStyle = labelColor;
    ctx.font = `bold ${FONT_SIZE}px sans-serif`;
    ctx.fillText(row.label, labelX, currentY);

    ctx.fillStyle = valueColor;
    ctx.fillText(row.value || '', valueX, currentY);

    currentY += lineHeight;
  }

  // Draw note box
  ctx.save();
  roundedRectPath(ctx, noteBoxX, noteBoxY, noteBoxW, noteBoxH, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#f9fafb';
  ctx.stroke();
  ctx.restore();

  // Note text
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.fillStyle = valueColor;
  ctx.textAlign = 'left';

  const totalNoteTextHeight = noteLines.length * lineHeight;
  let noteStartY = noteBoxY + (noteBoxH - totalNoteTextHeight) / 2;

  for (const line of noteLines) {
    ctx.fillText(line, noteBoxX + notePaddingX, noteStartY);
    noteStartY += lineHeight;
  }

  // Sprites bottom-right
  const spritePokemon = pokemonList.slice(0, 3);
  if (spritePokemon.length > 0) {
    const maxSprites = 3;
    const spriteRowWidth = imageSize;
    const spriteGap = 30;
    const spriteSize =
      (spriteRowWidth - spriteGap * (maxSprites - 1)) / maxSprites;

    const spriteY = CARD_HEIGHT - MARGIN - spriteSize;

    let spriteXs = [];

    if (spritePokemon.length === 1) {
      const totalWidth = spriteSize;
      const startX = rightX + (spriteRowWidth - totalWidth) / 2;
      spriteXs = [startX];
    } else if (spritePokemon.length === 2) {
      const totalWidth = spriteSize * 2 + spriteGap;
      const startX = rightX + (spriteRowWidth - totalWidth) / 2;
      spriteXs = [startX, startX + spriteSize + spriteGap];
    } else {
      spriteXs = [
        rightX,
        rightX + spriteSize + spriteGap,
        rightX + (spriteSize + spriteGap) * 2
      ];
    }

    for (let i = 0; i < spritePokemon.length; i++) {
      const name = spritePokemon[i];
      const x = spriteXs[i];
      await drawSpriteBox(ctx, x, spriteY, spriteSize, name);
    }
  }

  const buffer = canvas.toBuffer('image/png');
  const filePath = path.join(CARDS_DIR, `bounty_${bountyId}.png`);
  fs.writeFileSync(filePath, buffer);

  return buffer;
}

module.exports = { createBountyCard };
// cardRenderer.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const CARD_WIDTH = 1600;
const CARD_HEIGHT = 900;

const TEXT_WIDTH = 900;        // 60% of card
const IMAGE_WIDTH = 550;       // 40% of card
const MARGIN = 40;

const CARDS_DIR = path.join(__dirname, 'card-images');
if (!fs.existsSync(CARDS_DIR)) fs.mkdirSync(CARDS_DIR, { recursive: true });

/* ===============================
   RARITY GRADIENTS + BOX STYLE
================================= */
const rarityStyles = {
  paradox: {
    gradientFrom: '#3b82f6',
    gradientTo: '#a855f7',
    boxColor: 'rgba(10, 16, 28, 0.9)'
  },
  roamerMonth: {
    gradientFrom: '#f59e0b',
    gradientTo: '#ea580c',
    boxColor: 'rgba(15, 23, 42, 0.9)'
  },
  legendary: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee',
    boxColor: 'rgba(15, 23, 42, 0.9)'
  },
  rare: {
    gradientFrom: '#1d4ed8',
    gradientTo: '#22d3ee',
    boxColor: 'rgba(15, 23, 42, 0.9)'
  },
  common: {
    gradientFrom: '#16a34a',
    gradientTo: '#0f766e',
    boxColor: 'rgba(5, 46, 22, 0.9)'
  }
};

function getStyle(key) {
  return rarityStyles[key] || rarityStyles.common;
}

/* ===============================
   DRAW GOLD HEADER BAR SECTION
================================= */
function drawSection(ctx, x, y, w, header, lines, bgColor) {
  const headerBarHeight = 70;
  const padding = 28;
  const lineSpacing = 52;

  // --- Box background ---
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 0, 0);
  ctx.fill();

  // Estimate content height
  let estHeight = headerBarHeight + padding;
  ctx.font = 'bold 40px sans-serif';
  const maxWidth = w - padding * 2;

  lines.forEach(text => {
    if (ctx.measureText(text).width <= maxWidth) {
      estHeight += lineSpacing;
    } else {
      const words = text.split(' ');
      let current = '';
      words.forEach(word => {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth) {
          estHeight += lineSpacing;
          current = word;
        } else current = test;
      });
      estHeight += lineSpacing;
    }
  });

  // Actual box
  ctx.beginPath();
  ctx.roundRect(x, y, w, estHeight + padding, 24);
  ctx.fillStyle = bgColor;
  ctx.fill();

  // --- HEADER BAR ---
  ctx.beginPath();
  ctx.roundRect(x, y, w, headerBarHeight, 24);
  ctx.fillStyle = '#facc15'; // GOLD bar
  ctx.fill();

  // Header text
  ctx.fillStyle = '#1e1e1e';
  ctx.font = 'bold 50px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(header, x + w / 2, y + headerBarHeight / 2);

  // --- Body text ---
  ctx.textAlign = 'left';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = '#f9fafb';

  let cursorY = y + headerBarHeight + padding;

  lines.forEach(text => {
    const words = text.split(' ');
    let current = '';

    words.forEach(word => {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth) {
        ctx.fillText(current, x + padding, cursorY);
        cursorY += lineSpacing;
        current = word;
      } else {
        current = test;
      }
    });

    if (current) {
      ctx.fillText(current, x + padding, cursorY);
      cursorY += lineSpacing;
    }
  });

  return estHeight + padding + 20;
}

/* ===============================
   MAIN CARD GENERATOR
================================= */
async function createBountyCard(opts) {
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
  } = opts;

  const style = getStyle(rarityKey);

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  /* Background gradient */
  const g = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  g.addColorStop(0, style.gradientFrom);
  g.addColorStop(1, style.gradientTo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  /* ======================
       LEFT TEXT PANEL
  ======================== */
  const leftX = MARGIN;
  const leftY = MARGIN;
  const leftW = TEXT_WIDTH;
  const leftH = CARD_HEIGHT - MARGIN * 2;

  ctx.beginPath();
  ctx.roundRect(leftX, leftY, leftW, leftH, 30);
  ctx.fillStyle = style.boxColor;
  ctx.fill();


  /* Insert sections */
  let cursorY = leftY + 30;

  cursorY += drawSection(
    ctx,
    leftX + 20,
    cursorY,
    leftW - 40,
    "Trainer Info",
    [
      `Trainer: ${username}`,
      `Rank: ${rankName}`,
      `Rarity: ${rarityLabel}`
    ],
    style.boxColor
  );

  cursorY += 30;

  cursorY += drawSection(
    ctx,
    leftX + 20,
    cursorY,
    leftW - 40,
    "Reward",
    [rewardLabel],
    style.boxColor
  );

  cursorY += 30;

  cursorY += drawSection(
    ctx,
    leftX + 20,
    cursorY,
    leftW - 40,
    "Pokémon Targets",
    pokemons.map(p => `• ${p}`),
    style.boxColor
  );

  cursorY += 30;

  cursorY += drawSection(
    ctx,
    leftX + 20,
    cursorY,
    leftW - 40,
    "Timing",
    [
      `Start: ${startLabel}`,
      `End: ${endLabel}`,
      `Duration: ${durationLabel}`
    ],
    style.boxColor
  );

  cursorY += 30;

  cursorY += drawSection(
    ctx,
    leftX + 20,
    cursorY,
    leftW - 40,
    "Note",
    [note || "None"],
    style.boxColor
  );

  /* ======================
       RIGHT IMAGE PANEL
  ======================== */
  const imgX = leftX + leftW + MARGIN;
  const imgY = MARGIN;
  const imgSize = CARD_HEIGHT - MARGIN * 2;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(imgX, imgY, IMAGE_WIDTH, imgSize, 40);
  ctx.clip();

  try {
    const img = await loadImage(avatarUrl);

    const ratio = img.width / img.height;
    let w = IMAGE_WIDTH;
    let h = IMAGE_WIDTH / ratio;

    if (h > imgSize) {
      h = imgSize;
      w = imgSize * ratio;
    }

    const dx = imgX + (IMAGE_WIDTH - w) / 2;
    const dy = imgY + (imgSize - h) / 2;

    ctx.drawImage(img, dx, dy, w, h);

  } catch (e) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(imgX, imgY, IMAGE_WIDTH, imgSize);

    ctx.fillStyle = '#e5e7eb';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("No Image", imgX + IMAGE_WIDTH / 2, imgY + imgSize / 2);
  }

  ctx.restore();

  /* Save */
  const file = path.join(CARDS_DIR, `bounty_${bountyId}.png`);
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  return file;
}

module.exports = { createBountyCard };

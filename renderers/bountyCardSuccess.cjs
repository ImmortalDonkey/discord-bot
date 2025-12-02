// renderers/bountyCardSuccess.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;
const MARGIN = 40;

const CARDS_DIR = path.join(__dirname, "card-images");
const SPRITES_DIR = path.join(__dirname, "..", "sprites");

if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

const style = {
  gradientFrom: "#6ee7b7",
  gradientTo: "#065f46",
  boxColor: "rgba(0, 32, 15, 0.78)",
  gold: "#fbbf24"
};

// Rounded rect helper
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

// Draw sprite
async function drawSprite(ctx, x, y, size, name) {
  ctx.save();
  roundedRectPath(ctx, x, y, size, size, 30);
  ctx.fillStyle = "rgba(15,23,42,0.98)";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();

  const spritePath = path.join(SPRITES_DIR, `${name}.png`);
  if (fs.existsSync(spritePath)) {
    const img = await loadImage(spritePath);
    const pad = size * 0.15;
    const maxW = size - pad * 2;
    const maxH = size - pad * 2;
    const aspect = img.width / img.height;

    let w = maxW;
    let h = maxH;
    if (aspect > 1) h = maxW / aspect;
    else w = maxH * aspect;

    ctx.drawImage(
      img,
      x + (size - w) / 2,
      y + (size - h) / 2,
      w,
      h
    );
  }

  ctx.restore();
}

// Wrapped text
function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (let word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word + " ";
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}

/**
 * MAIN RENDERER
 */
async function createBountySuccessCard(options) {
  const {
    bountyId,
    nickname,
    rankName,
    pokemons,
    rewardLabel,
    avatarUrl
  } = options;

  const pokemonList = pokemons?.length ? pokemons : ["None"];
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background
  const g = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  g.addColorStop(0, style.gradientFrom);
  g.addColorStop(1, style.gradientTo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Right avatar box (exactly like cardRenderer)
  const totalInner = CARD_WIDTH - MARGIN * 3;
  const rightMax = totalInner * 0.4;
  const imageSize = Math.min(rightMax, CARD_HEIGHT - MARGIN * 2);

  const rightX = CARD_WIDTH - MARGIN - imageSize;
  const rightY = MARGIN;

  ctx.save();
  try {
    const img = await loadImage(avatarUrl);
    const aspect = img.width / img.height;

    let w = imageSize;
    let h = imageSize;
    if (aspect > 1) h = imageSize / aspect;
    else w = imageSize * aspect;

    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.clip();
    ctx.drawImage(
      img,
      rightX + (imageSize - w) / 2,
      rightY + (imageSize - h) / 2,
      w, h
    );

    ctx.restore();
    ctx.save();
    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
  } catch {
    ctx.restore();
    ctx.save();
    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.clip();
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.fillRect(rightX, rightY, imageSize, imageSize);
    ctx.restore();
    ctx.save();
    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
  }
  ctx.restore();

  // LEFT side layout
  const leftX = MARGIN;
  const leftWidth = rightX - leftX - MARGIN;
  const leftHeight = CARD_HEIGHT - MARGIN * 2;

  const boxGap = 40;

  // Same ratio as active card
  const infoBoxHeight = leftHeight * 0.65;
  const noteBoxHeight = leftHeight - infoBoxHeight - boxGap;

  const infoX = leftX;
  const infoY = MARGIN;

  const noteX = leftX;
  const noteY = infoY + infoBoxHeight + boxGap;

  // INFO BOX (with border)
  ctx.save();
  roundedRectPath(ctx, infoX, infoY, leftWidth, infoBoxHeight, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();

  // TEXT Settings
  const LABEL = 55;
  const VALUE = 55;
  const lineHeight = LABEL * 1.25;
  const groupGap = lineHeight * 0.7;
  const gold = style.gold;

  const rows = [];
  rows.push({ label: "Trainer:", value: nickname });
  rows.push({ label: "Rank:", value: rankName });
  rows.push({ spacer: true });

  rows.push({ label: "Target:", value: pokemonList[0] });
  for (let i = 1; i < pokemonList.length; i++) {
    rows.push({ label: "", value: pokemonList[i] });
  }

  rows.push({ label: "Reward:", value: rewardLabel });
  rows.push({ spacer: true });

  // Compute vertical centering
  ctx.font = `bold ${LABEL}px sans-serif`;
  let contentHeight = 0;
  rows.forEach(r => {
    contentHeight += r.spacer ? groupGap : lineHeight;
  });

  let startY = infoY + (infoBoxHeight - contentHeight) / 2;

  // Compute label column width
  let maxLabel = 0;
  for (const r of rows) {
    if (!r.label) continue;
    const w = ctx.measureText(r.label).width;
    if (w > maxLabel) maxLabel = w;
  }

  const labelX = infoX + 60;
  const valueX = labelX + maxLabel + 50;

  // Render all rows
  let cy = startY;
  for (const r of rows) {
    if (r.spacer) {
      cy += groupGap;
      continue;
    }

    ctx.font = `bold ${LABEL}px sans-serif`;

    ctx.fillStyle = gold;
    ctx.fillText(r.label, labelX, cy);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(r.value, valueX, cy);

    cy += lineHeight;
  }

  // NOTE BOX (Good luck / message)
  ctx.save();
  roundedRectPath(ctx, noteX, noteY, leftWidth, noteBoxHeight, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();

  // COMPLETED LABEL inside note box
  ctx.font = "bold 120px sans-serif";
  ctx.fillStyle = "#ffffff";

  const completedText = "COMPLETED";
  const completedWidth = ctx.measureText(completedText).width;

  ctx.fillText(
    completedText,
    noteX + (leftWidth - completedWidth) / 2,
    noteY + noteBoxHeight / 2 + 40
  );

  // SPRITE bottom-right (same spacing as active renderer)
  const spriteRowWidth = imageSize;
  const spriteSize =
    (spriteRowWidth - 30 * 2) / 3; // 3 slots layout
  const spriteY = CARD_HEIGHT - MARGIN - spriteSize;

  const spriteX = rightX + (spriteRowWidth - spriteSize) / 2;

  await drawSprite(ctx, spriteX, spriteY, spriteSize, pokemonList[0]);

  // Export
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(
    path.join(CARDS_DIR, `bountyEnd_${bountyId}_success.png`),
    buffer
  );

  return buffer;
}

module.exports = { createBountySuccessCard };
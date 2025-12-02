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

// FINAL SUCCESS STYLE
const style = {
  gradientFrom: "#6ee7b7",     // light green
  gradientTo: "#065f46",       // dark green
  boxColor: "rgba(0, 32, 15, 0.75)",
  gold: "#fbbf24"              // gold text for headers
};

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

function getSpritePath(name) {
  if (!name) return null;
  return path.join(SPRITES_DIR, `${name}.png`);
}

async function drawSprite(ctx, x, y, size, name) {
  ctx.save();
  roundedRect(ctx, x, y, size, size, 40);
  ctx.fillStyle = "rgba(15, 23, 42, 0.98)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();

  const spritePath = getSpritePath(name);
  let img = null;
  try {
    if (spritePath && fs.existsSync(spritePath)) {
      img = await loadImage(spritePath);
    }
  } catch {}

  if (img) {
    const pad = size * 0.15;
    const maxW = size - pad * 2;
    const maxH = size - pad * 2;
    const aspect = img.width / img.height;

    let drawW = maxW;
    let drawH = maxH;
    if (aspect > 1) drawH = maxW / aspect;
    else drawW = maxH * aspect;

    ctx.drawImage(
      img,
      x + (size - drawW) / 2,
      y + (size - drawH) / 2,
      drawW,
      drawH
    );
  }

  ctx.restore();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }

  ctx.fillText(line, x, y);
}

/**
 * Renderer entry point
 */
async function createBountySuccessCard(options) {
  const {
    bountyId,
    nickname,       // ✔ server nickname ONLY
    rankName,
    pokemons,
    rewardLabel,
    avatarUrl
  } = options;

  const pokemonList = pokemons && pokemons.length ? pokemons : ["None"];

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Gradient background
  const g = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  g.addColorStop(0, style.gradientFrom);
  g.addColorStop(1, style.gradientTo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // RIGHT IMAGE
  const rightW = (CARD_WIDTH - MARGIN * 3) * 0.40;
  const imageSize = rightW;
  const imageX = CARD_WIDTH - MARGIN - imageSize;
  const imageY = CARD_HEIGHT / 2 - imageSize / 2;

  ctx.save();
  try {
    const img = await loadImage(avatarUrl);
    roundedRect(ctx, imageX, imageY, imageSize, imageSize, 60);
    ctx.clip();

    let w = imageSize;
    let h = imageSize;
    const aspect = img.width / img.height;

    if (aspect > 1) h = imageSize / aspect;
    else w = imageSize * aspect;

    ctx.drawImage(
      img,
      imageX + (imageSize - w) / 2,
      imageY + (imageSize - h) / 2,
      w, h
    );

  } catch {
    roundedRect(ctx, imageX, imageY, imageSize, imageSize, 60);
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.fill();
  }
  ctx.restore();

  // LEFT COLUMNS
  const leftX = MARGIN;
  const leftWidth = imageX - leftX - MARGIN;
  const infoHeight = CARD_HEIGHT * 0.60;
  const infoY = MARGIN;

  // INFO BOX
  roundedRect(ctx, leftX, infoY, leftWidth, infoHeight, 50);
  ctx.fillStyle = style.boxColor;
  ctx.fill();

  const LABEL_FONT = 60;
  const VALUE_FONT = 60;
  const LINE_GAP = 75;

  let cursorY = infoY + 100;

  ctx.font = `bold ${LABEL_FONT}px sans-serif`;

  function goldLabel(label, value) {
    ctx.fillStyle = style.gold;
    ctx.fillText(label, leftX + 60, cursorY);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(value, leftX + 500, cursorY);

    cursorY += LINE_GAP;
  }

  goldLabel("Trainer:", nickname);
  goldLabel("Rank:", rankName);
  goldLabel("Target:", pokemonList[0]);

  for (let i = 1; i < pokemonList.length; i++) {
    goldLabel("", pokemonList[i]);
  }

  goldLabel("Reward:", rewardLabel);

  // COMPLETION LINE WRAPPED
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 55px sans-serif`;
  drawWrappedText(
    ctx,
    `${nickname} has successfully completed the bounty`,
    leftX + 60,
    cursorY + 15,
    leftWidth - 150,
    65
  );

  // COMPLETED BOX — CENTERED
  const boxY = infoY + infoHeight + 40;
  const boxHeight = CARD_HEIGHT - boxY - MARGIN;

  roundedRect(ctx, leftX, boxY, leftWidth, boxHeight, 50);
  ctx.fillStyle = style.boxColor;
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 120px sans-serif";
  const text = "COMPLETED";
  const textWidth = ctx.measureText(text).width;
  ctx.fillText(
    text,
    leftX + (leftWidth - textWidth) / 2,
    boxY + boxHeight / 2 + 40
  );

  // SPRITE — CENTERED RIGHT-BOTTOM
  const spriteSize = imageSize / 3;
  const spriteX = imageX + imageSize / 2 - spriteSize / 2;
  const spriteY = boxY + boxHeight / 2 - spriteSize / 2;

  await drawSprite(ctx, spriteX, spriteY, spriteSize, pokemonList[0]);

  // SAVE FILE
  const buffer = canvas.toBuffer("image/png");
  const filePath = path.join(CARDS_DIR, `bountyEnd_${bountyId}_success.png`);
  fs.writeFileSync(filePath, buffer);

  return buffer;
}

module.exports = { createBountySuccessCard };
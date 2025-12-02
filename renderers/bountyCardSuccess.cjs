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
  boxColor: "rgba(0, 32, 15, 0.75)",
  gold: "#fbbf24"
};

function roundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
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
    const pad = size * 0.12;
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
      w, h
    );
  }

  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lh) {
  const words = text.split(" ");
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + " ";
      y += lh;
    } else {
      line = test;
    }
  }

  ctx.fillText(line, x, y);
}

async function createBountySuccessCard(options) {
  const {
    bountyId,
    username,           // ✔ ALWAYS username (no nickname)
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

  // RIGHT PROFILE IMAGE (same box size & style as cardRenderer.cjs)
  const totalInnerWidth = CARD_WIDTH - MARGIN * 3;
  const rightMaxWidth = totalInnerWidth * 0.4;
  const rightMaxHeight = CARD_HEIGHT - 2 * MARGIN;
  const imageSize = Math.min(rightMaxWidth, rightMaxHeight);

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

    roundedRect(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.clip();

    ctx.drawImage(
      img,
      rightX + (imageSize - w) / 2,
      rightY + (imageSize - h) / 2,
      w, h
    );

    ctx.restore();
    ctx.save();
    roundedRect(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(248,250,252,0.9)";
    ctx.stroke();
  } catch {
    ctx.restore();
    ctx.save();
    roundedRect(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundedRect(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(248,250,252,0.9)";
    ctx.stroke();
  }
  ctx.restore();

  // LEFT INFO BOX (same ratio as cardRenderer.cjs)
  const leftX = MARGIN;
  const leftY = MARGIN;

  const leftWidth = rightX - leftX - MARGIN;
  const leftHeight = CARD_HEIGHT - MARGIN * 2;

  const infoBoxHeight = leftHeight * 0.62;   // same proportion
  const infoBoxY = leftY;

  roundedRect(ctx, leftX, infoBoxY, leftWidth, infoBoxHeight, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();

  const padX = 60;
  const lineHeight = 72;
  let cy = infoBoxY + (infoBoxHeight - lineHeight * 7) / 2;  // ✔ vertically centered

  ctx.font = "bold 60px sans-serif";

  function row(label, value) {
    ctx.fillStyle = style.gold;
    ctx.fillText(label, leftX + padX, cy);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(value, leftX + padX + 380, cy);

    cy += lineHeight;
  }

  row("Trainer:", username);
  row("Rank:", rankName);
  row("", ""); // spacing
  row("Target:", pokemonList[0]);

  for (let i = 1; i < pokemonList.length; i++) {
    row("", pokemonList[i]);
  }

  cy += lineHeight * 0.5;
  row("Reward:", rewardLabel);

  // COMPLETION TEXT
  ctx.font = "bold 55px sans-serif";
  ctx.fillStyle = "#ffffff";
  wrapText(
    ctx,
    `${username} has successfully completed the bounty`,
    leftX + padX,
    cy + 20,
    leftWidth - 120,
    65
  );

  // BOTTOM COMPLETED BOX
  const bottomBoxY = infoBoxY + infoBoxHeight + 40;
  const bottomBoxHeight = CARD_HEIGHT - bottomBoxY - MARGIN;

  roundedRect(ctx, leftX, bottomBoxY, leftWidth, bottomBoxHeight, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 120px sans-serif";

  const txt = "COMPLETED";
  const tw = ctx.measureText(txt).width;
  ctx.fillText(
    txt,
    leftX + (leftWidth - tw) / 2,
    bottomBoxY + bottomBoxHeight / 2 + 40
  );

  // BOTTOM-RIGHT SPRITE (same spacing as cardRenderer.cjs)
  const spriteSize =
    (imageSize - 30 * 2) / 3; // identical maths to original

  const spriteX = rightX + imageSize / 2 - spriteSize / 2;
  const spriteY = CARD_HEIGHT - MARGIN - spriteSize;

  await drawSprite(ctx, spriteX, spriteY, spriteSize, pokemonList[0]);

  // Save
  const buffer = canvas.toBuffer("image/png");
  const filePath = path.join(CARDS_DIR, `bountyEnd_${bountyId}_success.png`);
  fs.writeFileSync(filePath, buffer);

  return buffer;
}

module.exports = { createBountySuccessCard };
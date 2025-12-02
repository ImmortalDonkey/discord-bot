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

function getSpritePath(pokemon) {
  if (!pokemon) return null;
  return path.join(SPRITES_DIR, `${pokemon}.png`);
}

async function drawSprite(ctx, x, y, size, name) {
  ctx.save();
  roundedRect(ctx, x, y, size, size, 40);
  ctx.fillStyle = "rgba(15, 23, 42, 0.98)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();

  let img = null;
  try {
    const p = getSpritePath(name);
    if (p && fs.existsSync(p)) img = await loadImage(p);
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
      w,
      h
    );
  }
  ctx.restore();
}

async function createBountySuccessCard(options) {
  const {
    bountyId,
    username,
    rankName,
    pokemons,
    rewardLabel,
    avatarUrl,
    rarityLabel
  } = options;

  const pokemonList = pokemons?.length ? pokemons : ["None"];
  const target = pokemonList[0];

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background
  const g = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  g.addColorStop(0, style.gradientFrom);
  g.addColorStop(1, style.gradientTo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // RIGHT PROFILE IMAGE (identical to active card)
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
      w,
      h
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

  // LEFT TEXT BOX (same proportions)
  const leftX = MARGIN;
  const leftWidth = rightX - leftX - MARGIN;
  const leftHeight = CARD_HEIGHT - MARGIN * 2;
  const infoBoxHeight = leftHeight * 0.62;
  const infoBoxY = MARGIN;

  roundedRect(ctx, leftX, infoBoxY, leftWidth, infoBoxHeight, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();

  // TEXT LAYOUT
  const padX = 60;
  const rowGap = 78;
  const extraGap = 64; // extra between rarity → bounty paid (Option 3)
  const labelFont = "bold 60px sans-serif";
  const valueFont = "bold 60px sans-serif";

  const rows = [
    { label: "Trainer:", value: username },
    { label: "Rank:", value: rankName },
    { label: "Target:", value: target },
    { label: "Rarity:", value: rarityLabel },
    { label: "Bounty paid:", value: rewardLabel }
  ];

  // Calculate vertical offset
  ctx.font = valueFont;
  const totalRowsHeight = rowGap * 5 + extraGap; // extra between 4→5
  let cy = infoBoxY + (infoBoxHeight - totalRowsHeight) / 2 + 20;

  ctx.font = labelFont;

  function drawRow(label, value, gap) {
    ctx.font = labelFont;
    ctx.fillStyle = style.gold;
    ctx.fillText(label, leftX + padX, cy);

    ctx.font = valueFont;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(value, leftX + padX + 420, cy);

    cy += gap;
  }

  drawRow(rows[0].label, rows[0].value, rowGap);
  drawRow(rows[1].label, rows[1].value, rowGap);
  drawRow(rows[2].label, rows[2].value, rowGap);
  drawRow(rows[3].label, rows[3].value, rowGap + extraGap);
  drawRow(rows[4].label, rows[4].value, rowGap);

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
  ctx.font = "bold 140px sans-serif";

  const txt = "COMPLETED";
  const tw = ctx.measureText(txt).width;

  ctx.fillText(
    txt,
    leftX + (leftWidth - tw) / 2,
    bottomBoxY + bottomBoxHeight / 2 + 45
  );

  // SPRITE (same placement as active)
  const spriteSize = imageSize / 3;
  const spriteX = rightX + (imageSize - spriteSize) / 2;
  const spriteY = CARD_HEIGHT - MARGIN - spriteSize;

  await drawSprite(ctx, spriteX, spriteY, spriteSize, target);

  // Save file
  const buffer = canvas.toBuffer("image/png");
  const fp = path.join(CARDS_DIR, `bountyEnd_${bountyId}_success.png`);
  fs.writeFileSync(fp, buffer);

  return buffer;
}

module.exports = { createBountySuccessCard };

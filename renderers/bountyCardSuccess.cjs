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

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const g = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  g.addColorStop(0, style.gradientFrom);
  g.addColorStop(1, style.gradientTo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // RIGHT PROFILE IMAGE
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

  // LEFT COLUMN AREA
  const leftX = MARGIN;
  const leftY = MARGIN;
  const leftWidth = rightX - leftX - MARGIN;
  const leftHeight = CARD_HEIGHT - MARGIN * 2;

  // INFO BOX
  const infoBoxHeight = leftHeight * 0.62;
  const infoBoxY = leftY;

  roundedRect(ctx, leftX, infoBoxY, leftWidth, infoBoxHeight, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();

  // TEXT SETTINGS
  const LABEL_FONT = 60;
  const LINE_GAP = 75;
  const padX = 60;

  ctx.font = `bold ${LABEL_FONT}px sans-serif`;

  // Prepare labels
  const labels = ["Trainer:", "Rank:", "Target:", "Rarity:", "Reward:"];
  let maxLabelWidth = 0;

  for (const lab of labels) {
    const w = ctx.measureText(lab).width;
    if (w > maxLabelWidth) maxLabelWidth = w;
  }

  const labelX = leftX + padX;
  const valueX = labelX + maxLabelWidth + 40;

  // Build lines (with accurate count)
  const lines = [];

  lines.push({ type: "row", label: "Trainer:", value: username });
  lines.push({ type: "row", label: "Rank:", value: rankName });
  lines.push({ type: "spacer" });

  lines.push({ type: "row", label: "Target:", value: pokemonList[0] });
  for (let i = 1; i < pokemonList.length; i++) {
    lines.push({ type: "row", label: "", value: pokemonList[i] });
  }

  lines.push({ type: "row", label: "Rarity:", value: rarityLabel || "Unknown" });
  lines.push({ type: "spacer" });

  lines.push({ type: "row", label: "Reward:", value: rewardLabel });

  // COUNT LINES CORRECTLY (every entry is one line)
  const totalLines = lines.length;
  const blockHeight = totalLines * LINE_GAP;

  // TRUE centered start point
  let cy = infoBoxY + (infoBoxHeight - blockHeight) / 2 + LINE_GAP;

  // DRAW LINES
  for (const line of lines) {
    if (line.type === "spacer") {
      cy += LINE_GAP;
      continue;
    }

    ctx.fillStyle = style.gold;
    ctx.fillText(line.label, labelX, cy);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(line.value || "", valueX, cy);

    cy += LINE_GAP;
  }

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

  // SPRITE
  const spriteSize = imageSize / 3;
  const spriteX = rightX + imageSize / 2 - spriteSize / 2;
  const spriteY = CARD_HEIGHT - MARGIN - spriteSize;

  await drawSprite(ctx, spriteX, spriteY, spriteSize, pokemonList[0]);

  const buffer = canvas.toBuffer("image/png");
  const filePath = path.join(CARDS_DIR, `bountyEnd_${bountyId}_success.png`);
  fs.writeFileSync(filePath, buffer);

  return buffer;
}

module.exports = { createBountySuccessCard };

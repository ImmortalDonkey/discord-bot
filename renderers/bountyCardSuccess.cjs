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

// SUCCESS STYLE
const style = {
  gradientFrom: "#6ee7b7",
  gradientTo: "#065f46",
  boxColor: "rgba(0, 32, 15, 0.75)",
  gold: "#fbbf24"
};

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

function getSpritePath(name) {
  if (!name) return null;
  return path.join(SPRITES_DIR, `${name}.png`);
}

async function drawSprite(ctx, x, y, size, name) {
  // same sprite style as cardRenderer.cjs
  ctx.save();
  roundedRectPath(ctx, x, y, size, size, 30);
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

    let drawW = maxW;
    let drawH = maxH;
    if (aspect > 1) {
      drawH = maxW / aspect;
    } else {
      drawW = maxH * aspect;
    }

    ctx.drawImage(
      img,
      x + (size - drawW) / 2,
      y + (size - drawH) / 2,
      drawW,
      drawH
    );
  } else {
    ctx.font = "bold 34px sans-serif";
    ctx.fillStyle = "#f1f5f9";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No Sprite", x + size / 2, y + size / 2);
  }

  ctx.restore();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + " ";
    const width = ctx.measureText(test).width;

    if (width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}

async function createBountySuccessCard(options) {
  const {
    bountyId,
    username, // ALWAYS server nickname (scheduler handles this)
    rankName,
    pokemons,
    rewardLabel,
    avatarUrl
  } = options;

  const pokemonList = pokemons && pokemons.length ? pokemons : ["None"];

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // BACKGROUND GRADIENT
  const bg = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  bg.addColorStop(0, style.gradientFrom);
  bg.addColorStop(1, style.gradientTo);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // RIGHT PROFILE IMAGE (SAME AS cardRenderer.cjs)
  const totalInnerWidth = CARD_WIDTH - MARGIN * 3;
  const rightMaxWidth = totalInnerWidth * 0.40;
  const rightMaxHeight = CARD_HEIGHT - 2 * MARGIN;
  const imageSize = Math.min(rightMaxWidth, rightMaxHeight);

  const rightX = CARD_WIDTH - MARGIN - imageSize;
  const rightY = MARGIN;

  ctx.save();
  try {
    const img = await loadImage(avatarUrl);

    const aspect = img.width / img.height;
    let drawW = imageSize;
    let drawH = imageSize;

    if (aspect > 1) drawH = imageSize / aspect;
    else drawW = imageSize * aspect;

    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.clip();

    ctx.drawImage(
      img,
      rightX + (imageSize - drawW) / 2,
      rightY + (imageSize - drawH) / 2,
      drawW,
      drawH
    );

    ctx.restore();
    ctx.save();
    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(248, 250, 252, 0.9)";
    ctx.stroke();
  } catch {
    ctx.restore();
    ctx.save();
    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.clip();
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fillRect(rightX, rightY, imageSize, imageSize);
    ctx.font = "bold 42px sans-serif";
    ctx.fillStyle = "#e5e7eb";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No Image", rightX + imageSize / 2, rightY + imageSize / 2);

    ctx.restore();
    ctx.save();
    roundedRectPath(ctx, rightX, rightY, imageSize, imageSize, 40);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(248, 250, 252, 0.9)";
    ctx.stroke();
  }
  ctx.restore();

  // LEFT SIDE PANELS
  const leftX = MARGIN;
  const leftY = MARGIN;
  const leftWidth = rightX - leftX - MARGIN;
  const leftHeight = CARD_HEIGHT - 2 * MARGIN;

  // Info box settings
  const boxGap = 40;
  const infoHeight = leftHeight * 0.60;
  const infoY = leftY;

  roundedRectPath(ctx, leftX, infoY, leftWidth, infoHeight, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();

  let cursorY = infoY + 100;
  const LABEL_FONT = 60;
  const VALUE_FONT = 60;
  const LINE_GAP = 75;

  ctx.font = `bold ${LABEL_FONT}px sans-serif`;

  const goldLabel = (label, value) => {
    ctx.fillStyle = style.gold;
    ctx.fillText(label, leftX + 60, cursorY);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(value, leftX + 500, cursorY);

    cursorY += LINE_GAP;
  };

  goldLabel("Trainer:", username);
  goldLabel("Rank:", rankName);
  goldLabel("Target:", pokemonList[0]);

  for (let i = 1; i < pokemonList.length; i++) {
    goldLabel("", pokemonList[i]);
  }

  goldLabel("Reward:", rewardLabel);

  // Add extra spacing (matching live card)
  cursorY += 40;

  // WRAPPED COMPLETE MESSAGE
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 55px sans-serif`;

  drawWrappedText(
    ctx,
    `${username} has successfully completed the bounty`,
    leftX + 60,
    cursorY,
    leftWidth - 150,
    65
  );

  // COMPLETED BOX
  const boxY = infoY + infoHeight + boxGap;
  const boxHeight = leftHeight - infoHeight - boxGap;

  roundedRectPath(ctx, leftX, boxY, leftWidth, boxHeight, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 130px sans-serif";

  const completedText = "COMPLETED";
  const tw = ctx.measureText(completedText).width;

  ctx.fillText(
    completedText,
    leftX + (leftWidth - tw) / 2,
    boxY + boxHeight / 2 + 40
  );

  // SPRITES — MATCHING cardRenderer.cjs
  const spriteNames = pokemonList.slice(0, 3);

  if (spriteNames.length) {
    const maxSprites = 3;
    const spriteRowWidth = imageSize;
    const spriteGap = 30;
    const spriteSize =
      (spriteRowWidth - spriteGap * (maxSprites - 1)) / maxSprites;

    const spriteY = CARD_HEIGHT - MARGIN - spriteSize;

    let xs = [];

    if (spriteNames.length === 1) {
      xs = [rightX + (spriteRowWidth - spriteSize) / 2];
    } else if (spriteNames.length === 2) {
      xs = [
        rightX + (spriteRowWidth - (spriteSize * 2 + spriteGap)) / 2,
        rightX + (spriteRowWidth - (spriteSize * 2 + spriteGap)) / 2 + spriteSize + spriteGap
      ];
    } else {
      xs = [
        rightX,
        rightX + spriteSize + spriteGap,
        rightX + (spriteSize + spriteGap) * 2
      ];
    }

    for (let i = 0; i < spriteNames.length; i++) {
      await drawSprite(ctx, xs[i], spriteY, spriteSize, spriteNames[i]);
    }
  }

  // EXPORT
  const buffer = canvas.toBuffer("image/png");
  const filePath = path.join(CARDS_DIR, `bountyEnd_${bountyId}_success.png`);
  fs.writeFileSync(filePath, buffer);

  return buffer;
}

module.exports = { createBountySuccessCard };
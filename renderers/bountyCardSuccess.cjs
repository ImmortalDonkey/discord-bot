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
  roundedRect(ctx, x, y, size, size, 30);
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
  }

  ctx.restore();
}

/**
 * Completed bounty card (bright green background)
 *
 * options:
 *  - bountyId
 *  - username      (plain nickname, NOT a mention)
 *  - rankName
 *  - pokemons[]    (up to 3)
 *  - rewardLabel   (string, e.g. "1,000,000 PKD") OR reward (number)
 *  - reward        (optional numeric fallback)
 *  - avatarUrl
 */
async function createBountySuccessCard(options) {
  const {
    bountyId,
    username,
    rankName,
    pokemons,
    rewardLabel,
    reward,
    avatarUrl
  } = options;

  const pokemonList = pokemons?.length ? pokemons : ["None"];
  const rewardText =
    rewardLabel ||
    `${Number(reward || 0).toLocaleString()} PKD`;

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Bright green background
  const g = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  g.addColorStop(0, "#22c55e");
  g.addColorStop(1, "#16a34a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Right avatar box
  const rightW = (CARD_WIDTH - MARGIN * 3) * 0.4;
  const rightH = CARD_HEIGHT - MARGIN * 2;
  const imageSize = Math.min(rightW, rightH);
  const imageX = CARD_WIDTH - MARGIN - imageSize;
  const imageY = MARGIN;

  ctx.save();
  try {
    const img = await loadImage(avatarUrl);
    roundedRect(ctx, imageX, imageY, imageSize, imageSize, 40);
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
      w,
      h
    );
  } catch {
    roundedRect(ctx, imageX, imageY, imageSize, imageSize, 40);
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.fill();
  }
  ctx.restore();

  // Left column
  const leftX = MARGIN;
  const leftY = MARGIN;
  const leftWidth = imageX - MARGIN - leftX;
  const leftHeight = CARD_HEIGHT - MARGIN * 2;

  const boxGap = 40;
  const infoBoxHeight = leftHeight * 0.65;
  const noteBoxHeight = leftHeight - infoBoxHeight - boxGap;

  // Top info box
  roundedRect(ctx, leftX, leftY, leftWidth, infoBoxHeight, 40);
  ctx.fillStyle = "rgba(5, 46, 22, 0.95)"; // same as completed style
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();

  const FONT = 55;
  const lh = FONT * 1.25;
  ctx.font = `bold ${FONT}px sans-serif`;
  ctx.fillStyle = "#f9fafb";

  let lineY = leftY + 80;

  ctx.fillText(`Trainer:`, leftX + 60, lineY);
  ctx.fillText(username, leftX + 400, lineY);
  lineY += lh;

  ctx.fillText(`Rank:`, leftX + 60, lineY);
  ctx.fillText(rankName, leftX + 400, lineY);
  lineY += lh * 1.2;

  ctx.fillText(`Target:`, leftX + 60, lineY);
  ctx.fillText(pokemonList[0], leftX + 400, lineY);
  lineY += lh;

  for (let i = 1; i < pokemonList.length; i++) {
    ctx.fillText(pokemonList[i], leftX + 400, lineY);
    lineY += lh;
  }

  lineY += lh * 0.6;

  ctx.fillText(`Reward:`, leftX + 60, lineY);
  ctx.fillText(rewardText, leftX + 400, lineY);
  lineY += lh * 1.4;

  // This line is the “completion” text:
  ctx.fillText(
    `${username} has successfully completed the bounty`,
    leftX + 60,
    lineY
  );

  // Bottom note/status box
  const noteY = leftY + infoBoxHeight + boxGap;
  roundedRect(ctx, leftX, noteY, leftWidth, noteBoxHeight, 40);
  ctx.fillStyle = "rgba(5, 46, 22, 0.95)";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();

  ctx.font = `bold ${FONT}px sans-serif`;
  ctx.fillStyle = "#f9fafb";

  ctx.fillText("Completed", leftX + 60, noteY + noteBoxHeight / 2 - FONT / 2);

  // Sprites along bottom-right
  const spriteSize = imageSize / 3 - 20;
  const spriteY = CARD_HEIGHT - MARGIN - spriteSize - 20;
  let spriteX = imageX;

  for (const p of pokemonList.slice(0, 3)) {
    await drawSprite(ctx, spriteX, spriteY, spriteSize, p);
    spriteX += spriteSize + 30;
  }

  const buffer = canvas.toBuffer("image/png");
  const filePath = path.join(CARDS_DIR, `bountyEnd_${bountyId}.png`);
  fs.writeFileSync(filePath, buffer);

  return buffer;
}

module.exports = { createBountySuccessCard };
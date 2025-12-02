// renderers/reportCard.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;
const MARGIN = 40;

const REPORT_DIR = path.join(__dirname, "report-images");
const SPRITES_DIR = path.join(__dirname, "..", "sprites");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Rarity styles (same as bounty cards)
const rarityStyles = {
  paradox: {
    gradientFrom: "#3b82f6",
    gradientTo: "#a855f7",
    boxColor: "rgba(15, 23, 42, 0.95)"
  },
  roamerMonth: {
    gradientFrom: "#f97316",
    gradientTo: "#ec4899",
    boxColor: "rgba(17, 24, 39, 0.95)"
  },
  legendary: {
    gradientFrom: "#1d4ed8",
    gradientTo: "#22d3ee",
    boxColor: "rgba(15, 23, 42, 0.95)"
  },
  rare: {
    gradientFrom: "#1d4ed8",
    gradientTo: "#22d3ee",
    boxColor: "rgba(15, 23, 42, 0.95)"
  },
  common: {
    gradientFrom: "#16a34a",
    gradientTo: "#0f766e",
    boxColor: "rgba(5, 46, 22, 0.95)"
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

function wrapText(ctx, text, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let current = "";

  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function getSpritePathForPokemon(name) {
  if (!name) return null;
  return path.join(SPRITES_DIR, `${name}.png`);
}

async function drawFullSprite(ctx, x, y, boxW, boxH, pokemonName) {
  const spritePath = getSpritePathForPokemon(pokemonName);
  let img = null;

  try {
    if (spritePath && fs.existsSync(spritePath)) img = await loadImage(spritePath);
  } catch {
    img = null;
  }

  if (!img) {
    ctx.font = "bold 42px sans-serif";
    ctx.fillStyle = "#e5e7eb";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Sprite missing", x + boxW / 2, y + boxH / 2);
    return;
  }

  const imgRatio = img.width / img.height;
  const boxRatio = boxW / boxH;

  let drawW = boxW;
  let drawH = boxH;

  if (imgRatio > boxRatio) {
    drawW = boxW;
    drawH = boxW / imgRatio;
  } else {
    drawH = boxH;
    drawW = boxH * imgRatio;
  }

  const dx = x + (boxW - drawW) / 2;
  const dy = y + (boxH - drawH) / 2;

  ctx.drawImage(img, dx, dy, drawW, drawH);
}

async function createReportCard(report) {
  const {
    trainerName,
    trainerRank,
    pokemonName,
    rarityKey,
    rarityLabel,
    points,
    location,
    expired,
    availabilityText
  } = report;

  const style = getStyleForRarity(rarityKey);

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  //
  // Background gradient
  //
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, style.gradientFrom);
  gradient.addColorStop(1, style.gradientTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = "rgba(0, 0, 0, 0.20)";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  //
  // Layout calculations
  //
  const innerWidth = CARD_WIDTH - 2 * MARGIN;
  const innerHeight = CARD_HEIGHT - 2 * MARGIN;

  const columnGap = 40;
  const rowGap = 40;

  const leftW = Math.round((innerWidth - columnGap) * 0.6);
  const rightW = innerWidth - columnGap - leftW;

  const leftX = MARGIN;
  const rightX = leftX + leftW + columnGap;

  const topH = rightW; // square top-right box
  const bottomH = innerHeight - topH - rowGap;

  const topY = MARGIN;
  const bottomY = topY + topH + rowGap;

  //
  // TOP LEFT INFO BOX
  //
  const infoX = leftX;
  const infoY = topY;
  const infoW = leftW;
  const infoH = topH;

  ctx.save();
  roundedRectPath(ctx, infoX, infoY, infoW, infoH, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();
  ctx.restore();

  const FONT_SIZE = 60;
  const lineHeight = FONT_SIZE * 1.25;
  const groupSpacing = lineHeight * 0.7;

  const infoRows = [
    { label: "Trainer:", value: trainerName || "Unknown" },
    { label: "Rank:", value: trainerRank || "Trainer" },
    { spacer: true },

    { label: "Pokémon:", value: pokemonName },
    { spacer: true },

    { label: "Rarity:", value: rarityLabel },
    { spacer: true },

    { label: "Points:", value: String(points || 0) }
  ];

  const nonSpacerRows = infoRows.filter(r => !r.spacer).length;
  const spacerRows = infoRows.length - nonSpacerRows;

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;

  let maxLabelWidth = 0;
  for (const r of infoRows) {
    if (!r.spacer && r.label) {
      const w = ctx.measureText(r.label).width;
      if (w > maxLabelWidth) maxLabelWidth = w;
    }
  }

  const labelX = infoX + 60;
  const labelGap = 40;
  const valueX = labelX + maxLabelWidth + labelGap;

  const infoTextHeight =
    nonSpacerRows * lineHeight + spacerRows * groupSpacing;

  let drawY = infoY + (infoH - infoTextHeight) / 2;

  for (const r of infoRows) {
    if (r.spacer) {
      drawY += groupSpacing;
      continue;
    }

    ctx.fillStyle = "#facc15";
    ctx.fillText(r.label, labelX, drawY);

    ctx.fillStyle = "#f9fafb";
    ctx.fillText(r.value, valueX, drawY);

    drawY += lineHeight;
  }

  //
  // TOP RIGHT SPRITE BOX
  //
  const spriteX = rightX;
  const spriteY = topY;
  const spriteW = rightW;
  const spriteH = topH;

  ctx.save();
  roundedRectPath(ctx, spriteX, spriteY, spriteW, spriteH, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();
  ctx.clip();
  await drawFullSprite(ctx, spriteX, spriteY, spriteW, spriteH, pokemonName);
  ctx.restore();

  //
  // BOTTOM LEFT — AVAILABILITY
  //
  const blX = leftX;
  const blY = bottomY;
  const blW = leftW;
  const blH = bottomH;

  ctx.save();
  roundedRectPath(ctx, blX, blY, blW, blH, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();
  ctx.restore();

  const availability =
    availabilityText ||
    (expired ? "No longer available" : "Available until end of the hour");

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.fillStyle = "#facc15";
  ctx.textAlign = "center";

  const availLines = wrapText(ctx, availability, blW - 100, lineHeight);
  const availHeight = availLines.length * lineHeight;

  let ay = blY + (blH - availHeight) / 2;

  for (const line of availLines) {
    ctx.fillText(line, blX + blW / 2, ay);
    ay += lineHeight;
  }

  //
  // BOTTOM RIGHT — ROUTE
  //
  const brX = rightX;
  const brY = bottomY;
  const brW = rightW;
  const brH = bottomH;

  ctx.save();
  roundedRectPath(ctx, brX, brY, brW, brH, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();
  ctx.restore();

  const routeLines = wrapText(
    ctx,
    location || "Unknown location",
    brW - 100,
    lineHeight
  );
  const routeHeight = routeLines.length * lineHeight;

  ctx.font = `bold ${FONT_SIZE + 10}px sans-serif`;
  ctx.fillStyle = "#f9fafb";
  ctx.textAlign = "center";

  let ry = brY + (brH - routeHeight) / 2;

  for (const line of routeLines) {
    ctx.fillText(line, brX + brW / 2, ry);
    ry += lineHeight;
  }

  //
  // Save PNG
  //
  const safe = pokemonName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filepath = path.join(REPORT_DIR, `report_${safe}_${Date.now()}.png`);
  fs.writeFileSync(filepath, canvas.toBuffer("image/png"));

  return filepath;
}

module.exports = {
  createReportCard
};

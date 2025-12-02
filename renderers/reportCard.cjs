// renderers/reportCard.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;
const MARGIN = 40;

// NOTE: report images saved here
const REPORT_DIR = path.join(__dirname, "report-images");
// NOTE: sprites are in the root /sprites folder (one level up)
const SPRITES_DIR = path.join(__dirname, "..", "sprites");

// Ensure output folder exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Rarity styles: reuse from bounty card
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

// Simple word-wrap helper
function wrapText(ctx, text, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push("");
  return lines;
}

// Map a Pokémon name to its sprite path
function getSpritePathForPokemon(pokemonName) {
  if (!pokemonName) return null;
  const fileName = `${pokemonName}.png`; // preserves spaces & parentheses
  return path.join(SPRITES_DIR, fileName);
}

// Draw a sprite box with border + image
async function drawSpriteBox(ctx, x, y, size, pokemonName) {
  ctx.save();
  roundedRectPath(ctx, x, y, size, size, 30);
  ctx.fillStyle = "rgba(15, 23, 42, 0.98)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#f9fafb";
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
    ctx.font = "bold 42px sans-serif";
    ctx.fillStyle = "#e5e7eb";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Sprite missing", x + size / 2, y + size / 2);
  }

  ctx.restore();
}

/**
 * report:
 *  - trainerName      (server nickname)
 *  - trainerRank
 *  - pokemonName
 *  - rarityKey        (paradox / roamerMonth / legendary / rare / common)
 *  - rarityLabel      (e.g. "Paradox", "Roamer of the Month")
 *  - points           (number)
 *  - location         (route name)
 *  - expired          (boolean)
 *  - availabilityText (optional override)
 *
 * Returns: file path to saved PNG
 */
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

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, style.gradientFrom);
  gradient.addColorStop(1, style.gradientTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Slight dark overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.20)";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // ---- Layout ----
  // We’ll mirror the bounty style: big left column, smaller right column.
  const innerWidth = CARD_WIDTH - 2 * MARGIN;
  const innerHeight = CARD_HEIGHT - 2 * MARGIN;
  const columnGap = 40;
  const rowGap = 40;

  // Left ≈ 60%, right ≈ 40%
  const leftWidth = Math.round((innerWidth - columnGap) * 0.6);
  const rightWidth = innerWidth - columnGap - leftWidth;

  const leftX = MARGIN;
  const rightX = leftX + leftWidth + columnGap;

  const topHeight = Math.round((innerHeight - rowGap) * 0.6);
  const bottomHeight = innerHeight - rowGap - topHeight;

  const topY = MARGIN;
  const bottomY = topY + topHeight + rowGap;

  // ====== TOP LEFT: Trainer / Rank / Pokémon / Rarity / Points ======
  const infoBoxX = leftX;
  const infoBoxY = topY;
  const infoBoxW = leftWidth;
  const infoBoxH = topHeight;

  ctx.save();
  roundedRectPath(ctx, infoBoxX, infoBoxY, infoBoxW, infoBoxH, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();
  ctx.restore();

  const FONT_SIZE = 60;
  const lineHeight = FONT_SIZE * 1.25;
  const groupSpacing = lineHeight * 0.7;
  const labelColor = "#facc15";
  const valueColor = "#f9fafb";

  const infoRows = [
    { label: "Trainer:", value: trainerName || "Unknown" },
    { label: "Rank:", value: trainerRank || "Trainer" },
    { spacer: true },
    { label: "Pokémon:", value: pokemonName || "Unknown" },
    { spacer: true },
    { label: "Rarity:", value: rarityLabel || "Unknown" },
    { spacer: true },
    { label: "Points:", value: String(points ?? 0) }
  ];

  const nonSpacerRows = infoRows.filter(r => !r.spacer).length;
  const spacerCount = infoRows.filter(r => r.spacer).length;

  const infoPaddingX = 60;

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const labelsToMeasure = infoRows
    .filter(r => !r.spacer && r.label)
    .map(r => r.label);

  let maxLabelWidth = 0;
  for (const lab of labelsToMeasure) {
    const w = ctx.measureText(lab).width;
    if (w > maxLabelWidth) maxLabelWidth = w;
  }

  const labelGap = 40;
  const labelX = infoBoxX + infoPaddingX;
  const valueX = labelX + maxLabelWidth + labelGap;

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
    ctx.fillText(row.value || "", valueX, currentY);

    currentY += lineHeight;
  }

  // ====== BOTTOM LEFT: availability text ======
  const bottomLeftX = leftX;
  const bottomLeftY = bottomY;
  const bottomLeftW = leftWidth;
  const bottomLeftH = bottomHeight;

  ctx.save();
  roundedRectPath(ctx, bottomLeftX, bottomLeftY, bottomLeftW, bottomLeftH, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();
  ctx.restore();

  const availability =
    availabilityText ||
    (expired
      ? "No longer available"
      : "Available until end of the hour");

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.fillStyle = labelColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const availPaddingX = 50;
  const maxAvailWidth = bottomLeftW - availPaddingX * 2;
  const availLines = wrapText(ctx, availability, maxAvailWidth, lineHeight);
  const availTotalHeight = availLines.length * lineHeight;
  let availY = bottomLeftY + (bottomLeftH - availTotalHeight) / 2;
  const availCenterX = bottomLeftX + bottomLeftW / 2;

  for (const line of availLines) {
    ctx.fillText(line, availCenterX, availY);
    availY += lineHeight;
  }

  // ====== TOP RIGHT: sprite box ======
  const spriteBoxX = rightX;
  const spriteBoxY = topY;
  const spriteBoxW = rightWidth;
  const spriteBoxH = topHeight;

  // Outer box
  ctx.save();
  roundedRectPath(ctx, spriteBoxX, spriteBoxY, spriteBoxW, spriteBoxH, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();
  ctx.restore();

  // Inner sprite square (centered inside top-right box)
  const spriteSize = Math.min(spriteBoxW * 0.8, spriteBoxH * 0.8);
  const spriteX = spriteBoxX + (spriteBoxW - spriteSize) / 2;
  const spriteY = spriteBoxY + (spriteBoxH - spriteSize) / 2;
  await drawSpriteBox(ctx, spriteX, spriteY, spriteSize, pokemonName);

  // ====== BOTTOM RIGHT: route name ======
  const bottomRightX = rightX;
  const bottomRightY = bottomY;
  const bottomRightW = rightWidth;
  const bottomRightH = bottomHeight;

  ctx.save();
  roundedRectPath(ctx, bottomRightX, bottomRightY, bottomRightW, bottomRightH, 40);
  ctx.fillStyle = style.boxColor;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f9fafb";
  ctx.stroke();
  ctx.restore();

  const routeText = location || "Unknown route";
  ctx.font = `bold ${FONT_SIZE + 10}px sans-serif`;
  ctx.fillStyle = "#f9fafb";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const routePaddingX = 50;
  const maxRouteWidth = bottomRightW - routePaddingX * 2;
  const routeLines = wrapText(ctx, routeText, maxRouteWidth, lineHeight);
  const routeTotalHeight = routeLines.length * lineHeight;
  let routeY = bottomRightY + (bottomRightH - routeTotalHeight) / 2;
  const routeCenterX = bottomRightX + bottomRightW / 2;

  for (const line of routeLines) {
    ctx.fillText(line, routeCenterX, routeY);
    routeY += lineHeight;
  }

  // ====== Save PNG ======
  const safeName = (pokemonName || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const filePath = path.join(REPORT_DIR, `report_${safeName}_${Date.now()}.png`);

  fs.writeFileSync(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

module.exports = {
  createReportCard
};

// renderers/reportCard.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;

const REPORT_DIR = path.join(__dirname, "report-images");
const SPRITES_DIR = path.join(__dirname, "..", "sprites");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Rarity outline colours
const rarityOutline = {
  paradox: "#a855f7",
  roamerMonth: "#ec4899",
  legendary: "#22d3ee",
  rare: "#22d3ee",
  common: "#16a34a"
};

function getOutlineColor(key) {
  return rarityOutline[key] || "#ffffff";
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

function drawRoundedBox(ctx, x, y, w, h, radius, fill, stroke, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 10;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

function getSpritePath(name) {
  if (!name) return null;
  return path.join(SPRITES_DIR, `${name}.png`);
}

async function drawSpriteFixed(ctx, pokemonName, x, y, areaW, areaH) {
  const spritePath = getSpritePath(pokemonName);
  if (!spritePath || !fs.existsSync(spritePath)) return;

  const img = await loadImage(spritePath);

  // ⮕ Fixed scale used from your earlier working design
  const SCALE = 1.8;
  const drawW = img.width * SCALE;
  const drawH = img.height * SCALE;

  const dx = x + (areaW - drawW) / 2;
  const dy = y + (areaH - drawH) / 2;

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
    expired
  } = report;

  const outlineColor = getOutlineColor(rarityKey);
  const statusText = expired ? "Expired" : "Active";

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background solid black for now
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Margins system: 5% of width
  const M = Math.round(CARD_WIDTH * 0.05); // ~110px

  // MAIN PANEL (62% width)
  const panelW = Math.round(CARD_WIDTH * 0.62);
  const panelH = Math.round(CARD_HEIGHT * 0.65); // Option A height increase
  const panelX = M;
  const panelY = Math.round((CARD_HEIGHT - panelH) / 2);

  drawRoundedBox(
    ctx,
    panelX,
    panelY,
    panelW,
    panelH,
    45,
    "rgba(128,128,128,0.50)", // 50% grey
    outlineColor
  );

  // FONT
  const LABEL_COLOR = "#facc15"; // gold
  const VALUE_COLOR = "#ffffff";

  const FONT_SIZE = 70;
  const LINE_HEIGHT = FONT_SIZE * 1.25;
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.textBaseline = "middle";

  const rows = [
    ["Trainer:", trainerName],
    ["Rank:", trainerRank],
    ["Pokémon:", pokemonName],
    ["Rarity:", rarityLabel],
    ["Points:", String(points)],
    ["Status:", statusText]
  ];

  // center text inside panel
  const totalHeight = rows.length * LINE_HEIGHT;
  let y = panelY + (panelH - totalHeight) / 2 + LINE_HEIGHT / 2;
  const labelX = panelX + 60;

  // Value alignment
  let maxLabelWidth = 0;
  for (const [label] of rows) {
    const w = ctx.measureText(label).width;
    if (w > maxLabelWidth) maxLabelWidth = w;
  }
  const valueX = labelX + maxLabelWidth + 40;

  for (const [label, value] of rows) {
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(label, labelX, y);

    ctx.fillStyle = VALUE_COLOR;
    ctx.fillText(value, valueX, y);

    y += LINE_HEIGHT;
  }

  // SPRITE AREA (remaining width)
  const spriteX = panelX + panelW + M;
  const spriteW = CARD_WIDTH - spriteX - M;
  const spriteY = 0;
  const spriteH = CARD_HEIGHT - M - Math.round(CARD_HEIGHT * 0.18);

  await drawSpriteFixed(ctx, pokemonName, spriteX, spriteY, spriteW, spriteH);

  // ROUTE BOX
  const routeH = Math.round(CARD_HEIGHT * 0.18);
  const routeY = CARD_HEIGHT - routeH - M;

  drawRoundedBox(
    ctx,
    M,
    routeY,
    CARD_WIDTH - M * 2,
    routeH,
    45,
    "#ffffff",
    outlineColor
  );

  ctx.fillStyle = "#000000";
  ctx.font = `bold ${Math.round(FONT_SIZE * 1.15)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(location, CARD_WIDTH / 2, routeY + routeH / 2);

  // Save image
  const safe = pokemonName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filepath = path.join(REPORT_DIR, `report_${safe}_${Date.now()}.png`);
  fs.writeFileSync(filepath, canvas.toBuffer("image/png"));
  return filepath;
}

module.exports = { createReportCard };
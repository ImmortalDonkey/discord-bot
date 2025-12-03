const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;

// 5% margin based on width (applied on all sides)
const MARGIN = Math.round(CARD_WIDTH * 0.05); // 110px

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
  rare: "#38bdf8",
  common: "#4ade80"
};

// Rounded-rect helper
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

// Pixel-perfect sprite (no scaling)
async function drawSpriteCentered(ctx, areaX, areaY, areaW, areaH, pokemonName) {
  if (!pokemonName) return;

  const spritePath = path.join(SPRITES_DIR, `${pokemonName}.png`);
  if (!fs.existsSync(spritePath)) return;

  let img;
  try {
    img = await loadImage(spritePath);
  } catch {
    return;
  }

  const centerX = areaX + areaW / 2;
  const centerY = areaY + areaH / 2;

  const drawW = img.width;
  const drawH = img.height;

  const dx = centerX - drawW / 2;
  const dy = centerY - drawH / 2;

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
    statusText,
    backgroundImagePath
  } = report;

  const outlineColor = rarityOutline[rarityKey] || "#ffffff";
  const statusLine = statusText || (expired ? "Expired" : "Active");

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // ─────────────────────────────
  // BACKGROUND (can swap to route art later)
  // ─────────────────────────────
  if (backgroundImagePath && fs.existsSync(backgroundImagePath)) {
    const bg = await loadImage(backgroundImagePath);
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  // Inner usable area after margins
  const innerW = CARD_WIDTH - MARGIN * 2;
  const innerH = CARD_HEIGHT - MARGIN * 2;

  // Geometry: | MARGIN | PANEL | gap | SPRITE AREA | MARGIN |
  const gap = MARGIN; // 5% spacing between panel and sprite region
  const availableW = innerW - gap;

  // Panel width = 55% of available area (panel + sprite)
  const panelW = Math.round(availableW * 0.55);
  const spriteAreaW = availableW - panelW;

  const panelX = MARGIN;
  const spriteAreaX = panelX + panelW + gap;

  // ROUTE bar height (previously ~11% innerH, now +15%)
  const baseRouteRatio = 0.111;
  const routeRatio = baseRouteRatio * 1.15; // +15%
  const routeH = Math.round(innerH * routeRatio);

  const routeY = CARD_HEIGHT - MARGIN - routeH;
  const routeX = MARGIN;
  const routeW = innerW;

  // Available vertical space above route bar
  const availableHForPanel = routeY - MARGIN;

  // Panel height = 75% of this available space (reduced by 25%)
  const panelH = Math.round(availableHForPanel * 0.75);

  // Vertically center panel within this available area
  const panelY = MARGIN + Math.round((availableHForPanel - panelH) / 2);

  // Sprite area is entire vertical strip above route bar
  const spriteAreaY = MARGIN;
  const spriteAreaH = availableHForPanel;

  // ─────────────────────────────
  // MAIN TEXT PANEL
  // ─────────────────────────────
  ctx.save();
  roundedRectPath(ctx, panelX, panelY, panelW, panelH, 40);
  ctx.fillStyle = "rgba(180,180,180,0.5)"; // 50% light grey
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();
  ctx.restore();

  // Typography
  const LABEL_COLOR = "#facc15"; // gold
  const VALUE_COLOR = "#ffffff";
  const FONT_SIZE = 66;         // +10% from 60
  const LINE_HEIGHT = FONT_SIZE * 1.28;

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // Fields (Trainer + Rank grouped logically)
  const fields = [
    { label: "Trainer:", value: trainerName || "Unknown" },
    { label: "Rank:", value: trainerRank || "Trainer" },
    { spacer: true },
    { label: "Pokémon:", value: pokemonName || "Unknown" },
    { spacer: true },
    { label: "Rarity:", value: rarityLabel || "Unknown" },
    { spacer: true },
    { label: "Points:", value: String(points || 0) },
    { spacer: true },
    { label: "Status:", value: statusLine }
  ];

  // Determine label column width
  let maxLabelW = 0;
  for (const row of fields) {
    if (!row.spacer && row.label) {
      const w = ctx.measureText(row.label).width;
      if (w > maxLabelW) maxLabelW = w;
    }
  }

  const innerPadX = Math.round(panelW * 0.05); // slight inset from left border
  const labelX = panelX + innerPadX;
  const valueX = labelX + maxLabelW + 45;

  // Compute total block height for vertical centering
  const nonSpacerCount = fields.filter(r => !r.spacer).length;
  const spacerCount = fields.length - nonSpacerCount;
  const spacerHeight = LINE_HEIGHT * 0.55;

  const textBlockHeight =
    nonSpacerCount * LINE_HEIGHT + spacerCount * spacerHeight;

  let currentY =
    panelY + (panelH - textBlockHeight) / 2 + LINE_HEIGHT * 0.1;

  for (const row of fields) {
    if (row.spacer) {
      currentY += spacerHeight;
      continue;
    }

    // Label
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(row.label, labelX, currentY);

    // Value
    ctx.fillStyle = VALUE_COLOR;
    ctx.fillText(row.value, valueX, currentY);

    currentY += LINE_HEIGHT;
  }

  // ─────────────────────────────
  // SPRITE — pixel-perfect, centered in its area
  // ─────────────────────────────
  await drawSpriteCentered(
    ctx,
    spriteAreaX,
    spriteAreaY,
    spriteAreaW,
    spriteAreaH,
    pokemonName
  );

  // ─────────────────────────────
  // FULL-WIDTH ROUTE BOX (BOTTOM)
  // ─────────────────────────────
  ctx.save();
  roundedRectPath(ctx, routeX, routeY, routeW, routeH, 40);
  ctx.fillStyle = "#ffffff"; // solid white background
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = outlineColor; // same border as main panel
  ctx.stroke();
  ctx.restore();

  // Route text: bold black, +15% font size, centered X+Y
  const routeFontSize = Math.round(FONT_SIZE * 1.15);
  ctx.font = `bold ${routeFontSize}px sans-serif`;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const routeName = location || "Unknown Route";
  ctx.fillText(routeName, routeX + routeW / 2, routeY + routeH / 2);

  // ─────────────────────────────
  // SAVE FILE
  // ─────────────────────────────
  const safe =
    (pokemonName || "pokemon").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filePath = path.join(
    REPORT_DIR,
    `report_${safe}_${Date.now()}.png`
  );

  fs.writeFileSync(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

module.exports = { createReportCard };
// renderers/reportCard.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;
const MARGIN = Math.floor(CARD_WIDTH * 0.05); // 5% margin

const REPORT_DIR = path.join(__dirname, "report-images");
const SPRITES_DIR = path.join(__dirname, "..", "sprites");
const BG_DIR = path.join(__dirname, "report-bg");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Outline colors by rarity
const rarityOutline = {
  paradox: "#a855f7",
  roamerMonth: "#ec4899",
  legendary: "#22d3ee",
  rare: "#38bdf8",
  common: "#4ade80"
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

async function drawSprite(ctx, x, y, spriteW, spriteH, pokemonName) {
  if (!pokemonName) return;

  const spritePath = path.join(SPRITES_DIR, `${pokemonName}.png`);
  if (!fs.existsSync(spritePath)) return;

  const img = await loadImage(spritePath);
  const imgRatio = img.width / img.height;
  const boxRatio = spriteW / spriteH;

  let drawW = spriteW;
  let drawH = spriteH;

  if (imgRatio > boxRatio) drawH = drawW / imgRatio;
  else drawW = drawH * imgRatio;

  const dx = x + (spriteW - drawW) / 2;
  const dy = y + (spriteH - drawH) / 2;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

async function createReportCard(report) {
  const { trainerName, trainerRank, pokemonName, rarityKey, rarityLabel, points, location, statusText } = report;

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Load route background if exists
  const routeFile = String(location || "").toLowerCase().replace(/\s+/g, "-") + ".png";
  const bgPath = path.join(BG_DIR, routeFile);

  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  const innerWidth = CARD_WIDTH - MARGIN * 2;
  const innerHeight = CARD_HEIGHT - MARGIN * 2;

  // Wider main panel: 58%
  const leftW = Math.floor(innerWidth * 0.58);
  const rightW = innerWidth - leftW;

  const leftX = MARGIN;
  const leftY = MARGIN;

  // Panel height leaves space for bar
  const panelW = leftW;
  const panelH = innerHeight - 160;

  // Main info panel
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, panelW, panelH, 40);
  ctx.fillStyle = "rgba(50, 50, 50, 0.70)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  // TEXT
  const LABEL_COLOR = "#facc15";
  const VALUE_COLOR = "#ffffff";
  const FONT_SIZE = 66;
  const lineHeight = FONT_SIZE * 1.25;
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;

  const fields = [
    { label: "Trainer:", value: trainerName },
    { label: "Rank:", value: trainerRank },
    { spacer: true },
    { label: "Pokémon:", value: pokemonName },
    { spacer: true },
    { label: "Rarity:", value: rarityLabel },
    { spacer: true },
    { label: "Points:", value: String(points || 0) },
    { spacer: true },
    { label: "Status:", value: statusText || "Active" }
  ];

  const nonSpacers = fields.filter(f => !f.spacer).length;
  const spacerCount = fields.length - nonSpacers;
  const textBlockHeight = nonSpacers * lineHeight + spacerCount * (lineHeight * 0.5);

  let currentY = leftY + (panelH - textBlockHeight) / 2;
  const labelX = leftX + 60;

  fields.forEach(f => {
    if (f.spacer) {
      currentY += lineHeight * 0.5;
      return;
    }
    // Label
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = "left";
    ctx.fillText(f.label, labelX, currentY);

    // Value — wrap long rarity
    ctx.fillStyle = VALUE_COLOR;
    const valueLines = wrapText(f.value, panelW - 280, ctx);
    valueLines.forEach(line => {
      ctx.fillText(line, labelX + 250, currentY);
      currentY += lineHeight * 0.9;
    });
    currentY += lineHeight * 0.1;
  });

  // SPRITE fixed scale
  const spriteW = rightW - 180;
  const spriteH = panelH - 120;

  await drawSprite(
    ctx,
    leftX + panelW + 90,
    leftY + 60,
    spriteW,
    spriteH,
    pokemonName
  );

  // ROUTE BAR
  const routeX = MARGIN;
  const routeH = 120;
  const routeY = CARD_HEIGHT - MARGIN - routeH;
  const routeW = innerWidth;

  ctx.save();
  roundedRectPath(ctx, routeX, routeY, routeW, routeH, 35);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${FONT_SIZE + 20}px sans-serif`;
  ctx.fillStyle = "#000000";
  ctx.fillText(location || "Unknown Route", routeX + routeW / 2, routeY + routeH / 2);

  // Save
  const safeName = pokemonName?.toLowerCase()?.replace(/[^a-z0-9]+/g, "-") || "pokemon";
  const outPath = path.join(REPORT_DIR, `report_${safeName}_${Date.now()}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer());
  return outPath;
}

// Text wrap helper
function wrapText(text, maxWidth, ctx) {
  const words = (text || "").split(" ");
  let lines = [];
  let line = "";
  words.forEach(w => {
    const test = line + w + " ";
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = w + " ";
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

module.exports = { createReportCard };
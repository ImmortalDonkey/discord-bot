// renderers/reportCard_v3_final.cjs
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

// SPRITE — pixel-perfect native scale x2
async function drawSprite(ctx, centerX, centerY, pokemonName) {
  const spritePath = path.join(SPRITES_DIR, `${pokemonName}.png`);
  if (!fs.existsSync(spritePath)) return;

  const img = await loadImage(spritePath);

  ctx.imageSmoothingEnabled = false;

  const drawH = img.height * 2;
  const drawW = img.width * 2;

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
    statusText
  } = report;

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  const routeFile = String(location || "").toLowerCase().replace(/\s+/g, "-") + ".png";
  const bgPath = path.join(BG_DIR, routeFile);

  ctx.imageSmoothingEnabled = false;

  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  const innerWidth = CARD_WIDTH - MARGIN * 2;
  const innerHeight = CARD_HEIGHT - MARGIN * 2;

  const leftW = Math.floor(innerWidth * 0.58);
  const rightW = innerWidth - leftW;

  const leftX = MARGIN;
  const leftY = MARGIN;

  const panelW = leftW;
  const panelH = innerHeight - 160;

  ctx.save();
  roundedRectPath(ctx, leftX, leftY, panelW, panelH, 40);
  ctx.fillStyle = "rgba(50, 50, 50, 0.70)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  const LABEL_COLOR = "#facc15";
  const VALUE_COLOR = "#ffffff";

  const FONT_SIZE = 28;
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
  const spacers = fields.length - nonSpacers;
  const textBlockHeight = nonSpacers * lineHeight + spacers * (lineHeight * 0.5);

  let currentY = leftY + (panelH - textBlockHeight) / 2 + lineHeight;

  const labelX = leftX + 60;
  const valueX = labelX + 250;

  fields.forEach(f => {
    if (f.spacer) {
      currentY += lineHeight * 0.5;
      return;
    }

    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(f.label, labelX, currentY);

    ctx.fillStyle = VALUE_COLOR;

    const valueLines = wrapText(f.value, panelW - 300, ctx);
    valueLines.forEach(line => {
      ctx.fillText(line, valueX, currentY);
      currentY += lineHeight * 0.85;
    });

    currentY += lineHeight * 0.15;
  });

  const spriteCenterX = leftX + panelW + rightW / 2;
  const spriteCenterY = CARD_HEIGHT / 2;

  await drawSprite(ctx, spriteCenterX, spriteCenterY, pokemonName);

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

  ctx.font = `bold ${Math.floor(FONT_SIZE * 1.3)}px sans-serif`;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(location || "Unknown Route", routeX + routeW / 2, routeY + routeH / 2);

  const safeName = pokemonName?.toLowerCase()?.replace(/[^a-z0-9]+/g, "-") || "pokemon";
  const outPath = path.join(REPORT_DIR, `report_${safeName}_${Date.now()}.png`);

  fs.writeFileSync(outPath, canvas.toBuffer());
  return outPath;
}

// Word wrap helper
function wrapText(text, maxWidth, ctx) {
  const words = (text || "").split(" ");
  let lines = [];
  let line = "";

  words.forEach(w => {
    const test = line + w + " ";
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line.trim());
      line = w + " ";
    } else {
      line = test;
    }
  });

  if (line) lines.push(line.trim());
  return lines;
}

module.exports = { createReportCard };

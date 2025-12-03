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

// Outline colours based on rarity
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

  const p = path.join(SPRITES_DIR, `${pokemonName}.png`);
  if (!fs.existsSync(p)) return;

  const img = await loadImage(p);

  const imgRatio = img.width / img.height;
  const boxRatio = spriteW / spriteH;

  let drawW = spriteW;
  let drawH = spriteH;

  if (imgRatio > boxRatio) {
    drawH = drawW / imgRatio;
  } else {
    drawW = drawH * imgRatio;
  }

  const dx = x + (spriteW - drawW) / 2;
  const dy = y + (spriteH - drawH) / 2;

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

  // Background transparent for route backgrounds
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const innerWidth = CARD_WIDTH - MARGIN * 2;
  const innerHeight = CARD_HEIGHT - MARGIN * 2;

  const leftW = Math.floor(innerWidth * 0.50); // 10% narrower
  const rightW = innerWidth - leftW;

  const leftX = MARGIN;
  const rightX = leftX + leftW;
  const leftY = MARGIN;

  // ──────────────────────────────
  // LEFT PANEL — Full Height
  // ──────────────────────────────
  const panelW = leftW;
  const panelH = innerHeight - 160; // leave space for full-width route bar

  ctx.save();
  roundedRectPath(ctx, leftX, leftY, panelW, panelH, 40);
  ctx.fillStyle = "rgba(180, 180, 180, 0.50)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  // FONT SETTINGS
  const LABEL_COLOR = "#facc15"; // gold label
  const VALUE_COLOR = "#ffffff";
  const FONT_SIZE = 66;
  const lineHeight = FONT_SIZE * 1.28;

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

  const nonSpacers = fields.filter(x => !x.spacer).length;
  const spacers = fields.length - nonSpacers;

  const textBlockHeight = nonSpacers * lineHeight + spacers * (lineHeight * 0.55);
  let currentY = leftY + (panelH - textBlockHeight) / 2 + lineHeight * 0.25;

  let maxLabelWidth = 0;
  fields.forEach(f => {
    if (!f.spacer && f.label) {
      const w = ctx.measureText(f.label).width;
      if (w > maxLabelWidth) maxLabelWidth = w;
    }
  });

  const labelX = leftX + 70;
  const valueX = labelX + maxLabelWidth + 45;

  fields.forEach(f => {
    if (f.spacer) {
      currentY += lineHeight * 0.55;
      return;
    }

    // Label
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(f.label, labelX, currentY);

    // Value
    ctx.fillStyle = VALUE_COLOR;
    ctx.fillText(f.value, valueX, currentY);

    currentY += lineHeight;
  });

  // ──────────────────────────────
  // SPRITE — floating right
  // ──────────────────────────────
  const spritePadding = 60;
  const spriteW = rightW - spritePadding * 2;
  const spriteH = panelH - spritePadding * 2;

  await drawSprite(
    ctx,
    rightX + spritePadding,
    leftY + spritePadding,
    spriteW,
    spriteH,
    pokemonName
  );

  // ──────────────────────────────
  // FULL-WIDTH ROUTE BOX
  // ──────────────────────────────
  const routeX = MARGIN;
  const routeH = 120;
  const routeY = CARD_HEIGHT - MARGIN - routeH;
  const routeW = innerWidth;

  ctx.save();
  roundedRectPath(ctx, routeX, routeY, routeW, routeH, 35);
  ctx.fillStyle = "#ffffff"; // solid white
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  // Route text centered in X and Y
  ctx.font = `bold ${FONT_SIZE + 20}px sans-serif`;
  ctx.fillStyle = "#000000"; // black text
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(location || "Unknown Route", routeX + routeW / 2, routeY + routeH / 2);

  // Save file
  const safe = pokemonName?.toLowerCase()?.replace(/[^a-z0-9]+/g, "-") || "pokemon";
  const filePath = path.join(REPORT_DIR, `report_${safe}_${Date.now()}.png`);
  fs.writeFileSync(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

module.exports = { createReportCard };
// renderers/reportCard.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;
const MARGIN = Math.floor(CARD_WIDTH * 0.05);

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

async function drawSprite(ctx, x, y, maxW, maxH, pokemonName) {
  const spritePath = path.join(SPRITES_DIR, `${pokemonName}.png`);
  if (!fs.existsSync(spritePath)) return;

  const img = await loadImage(spritePath);
  ctx.imageSmoothingEnabled = false;

  const maxScaleUp = 4; // Pixel-perfect expansion
  const targetH = Math.min(img.height * maxScaleUp, maxH);
  const scale = targetH / img.height;
  const targetW = img.width * scale;

  const dx = x + (maxW - targetW) / 2;
  const dy = y + (maxH - targetH) / 2;

  ctx.drawImage(img, dx, dy, targetW, targetH);
}

function wrapText(text, maxWidth, ctx) {
  const words = (text || "").split(" ");
  const lines = [];
  let line = "";
  words.forEach(word => {
    const testLine = line + word + " ";
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(line.trim());
      line = word + " ";
    } else {
      line = testLine;
    }
  });
  if (line.trim()) lines.push(line.trim());
  return lines;
}

async function createReportCard(report) {
  const { trainerName, trainerRank, pokemonName, rarityKey, rarityLabel, points, location, statusText } = report;

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  const routeFile = String(location || "").toLowerCase().replace(/\s+/g, "-") + ".png";
  const bgPath = path.join(BG_DIR, routeFile);

  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.fillStyle = "#000000";
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

  // PANEL
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, panelW, panelH, 45);
  ctx.fillStyle = "rgba(50,50,50,0.70)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  const LABEL_COLOR = "#facc15";
  const VALUE_COLOR = "#ffffff";
  const FONT_SIZE = 55;
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

  const lines = fields.map(f =>
    f.spacer ? 1 : wrapText(f.value, panelW - 260 - 100, ctx).length
  );

  const totalLines = lines.reduce((a, b) => a + b, 0);
  const totalHeight = totalLines * lineHeight + (fields.length * (lineHeight * 0.40));

  let currentY = leftY + (panelH - totalHeight) / 2;

  const labelX = leftX + 70;
  const valueX = labelX + 260;

  fields.forEach((f, i) => {
    if (f.spacer) {
      currentY += lineHeight * 0.40;
      return;
    }

    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(f.label, labelX, currentY);

    ctx.fillStyle = VALUE_COLOR;
    wrapText(f.value, panelW - 260 - 100, ctx).forEach(line => {
      ctx.fillText(line, valueX, currentY);
      currentY += lineHeight;
    });

    currentY += lineHeight * 0.20;
  });

  // SPRITE
  await drawSprite(
    ctx,
    leftX + panelW + 40,
    leftY + 40,
    rightW - 80,
    panelH - 80,
    pokemonName
  );

  // ROUTE BAR
  const routeX = MARGIN;
  const routeH = 120;
  const routeY = CARD_HEIGHT - MARGIN - routeH;
  const routeW = innerWidth;

  ctx.save();
  roundedRectPath(ctx, routeX, routeY, routeW, routeH, 40);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000000";
  ctx.font = `bold ${FONT_SIZE + 20}px sans-serif`;
  ctx.fillText(location || "Unknown Route", routeX + routeW / 2, routeY + routeH / 2);

  const safeName = pokemonName?.toLowerCase()?.replace(/[^a-z0-9]+/g, "-");
  const outputPath = path.join(REPORT_DIR, `report_${safeName}_${Date.now()}.png`);
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return outputPath;
}

module.exports = { createReportCard };

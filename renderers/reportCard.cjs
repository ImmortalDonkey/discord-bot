// renderers/reportCard.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 1100;
const CARD_HEIGHT = 650;

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

async function drawSprite(ctx, x, y, maxH, pokemonName) {
  const spritePath = path.join(SPRITES_DIR, `${pokemonName}.png`);
  if (!fs.existsSync(spritePath)) return;

  const img = await loadImage(spritePath);

  // Pixel perfect scaling — scale sprite height to 2× native if possible
  const scale = Math.min(maxH / img.height, 2.0);
  const drawW = img.width * scale;
  const drawH = img.height * scale;

  const dx = x - drawW / 2;
  const dy = y - drawH / 2;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

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
  if (line) lines.push(line.trim());
  return lines;
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

  // 🔹 Load route background if exists
  const routeFile = String(location || "")
    .toLowerCase()
    .replace(/\s+/g, "-") + ".png";
  const bgPath = path.join(BG_DIR, routeFile);

  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  // Layout calculation
  const innerWidth = CARD_WIDTH - MARGIN * 2;
  const innerHeight = CARD_HEIGHT - MARGIN * 2;

  const leftW = Math.floor(innerWidth * 0.60);
  const rightXcenter = MARGIN + leftW + (innerWidth * 0.40) / 2;
  const panelH = innerHeight - 90;
  const leftX = MARGIN;
  const leftY = MARGIN;

  // 🔸 Main info panel
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, leftW, panelH, 25);
  ctx.fillStyle = "rgba(50,50,50,0.70)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#fff";
  ctx.stroke();
  ctx.restore();

  // Text
  const LABEL_COLOR = "#facc15";
  const VALUE_COLOR = "#ffffff";
  const FONT_SIZE = 55;
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  const lineHeight = FONT_SIZE * 1.2;

  const fields = [
    { label: "Trainer:", value: trainerName },
    { label: "Rank:", value: trainerRank },
    { spacer: true },
    { label: "Pokémon:", value: pokemonName, wrap: true },
    { spacer: true },
    { label: "Rarity:", value: rarityLabel, wrap: true },
    { spacer: true },
    { label: "Points:", value: String(points || 0) },
    { spacer: true },
    { label: "Status:", value: statusText || "Active" }
  ];

  const visibleLines = fields.reduce((n, f) => n + (f.spacer ? 0.5 : 1), 0);
  const textBlockH = visibleLines * lineHeight;
  let yCursor = leftY + (panelH - textBlockH) / 2;

  const labelX = leftX + 35;
  const valueX = leftX + leftW * 0.37;
  const maxWrapW = leftW - (valueX - leftX) - 30;

  fields.forEach(f => {
    if (f.spacer) {
      yCursor += lineHeight * 0.5;
      return;
    }

    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(f.label, labelX, yCursor);

    ctx.fillStyle = VALUE_COLOR;
    if (f.wrap) {
      let lines = wrapText(f.value, maxWrapW, ctx);
      for (let ln of lines) {
        ctx.fillText(ln, valueX, yCursor);
        yCursor += lineHeight * 0.95;
      }
    } else {
      ctx.fillText(f.value, valueX, yCursor);
      yCursor += lineHeight;
    }
  });

  // 🔹 Sprite pixel crisp
  await drawSprite(
    ctx,
    rightXcenter,
    CARD_HEIGHT / 2 - 30,
    panelH * 0.90,
    pokemonName
  );

  // 🔹 Route bar
  const routeX = MARGIN;
  const routeW = innerWidth;
  const routeH = 80;
  const routeY = CARD_HEIGHT - MARGIN - routeH;

  ctx.save();
  roundedRectPath(ctx, routeX, routeY, routeW, routeH, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#fff";
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${FONT_SIZE + 8}px sans-serif`;
  ctx.fillStyle = "#000";
  ctx.fillText(location || "Unknown Area", routeX + routeW / 2, routeY + routeH / 2);

  // Save
  const safe = pokemonName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const outFile = path.join(REPORT_DIR, `report_${safe}_${Date.now()}.png`);
  fs.writeFileSync(outFile, canvas.toBuffer());

  return outFile;
}

module.exports = { createReportCard };

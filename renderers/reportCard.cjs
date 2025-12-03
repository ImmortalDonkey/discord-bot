// renderers/reportCard.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;
const MARGIN = Math.floor(CARD_WIDTH * 0.05); // 5% outer margin

const REPORT_DIR = path.join(__dirname, "report-images");
const SPRITES_DIR = path.join(__dirname, "..", "sprites");
const BG_DIR = path.join(__dirname, "report-bg");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Outline by rarity
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
  const spritePath = path.join(SPRITES_DIR, `${pokemonName}.png`);
  if (!fs.existsSync(spritePath)) return;

  const img = await loadImage(spritePath);
  const imgRatio = img.width / img.height;
  const boxRatio = spriteW / spriteH;

  let drawW = spriteW;
  let drawH = spriteH;

  if (imgRatio > boxRatio) drawH = drawW / imgRatio;
  else drawW = drawH * imgRatio;

  ctx.drawImage(
    img,
    x + (spriteW - drawW) / 2,
    y + (spriteH - drawH) / 2,
    drawW, drawH
  );
}

// helper for Pokémon + Rarity only
function wrapValue(ctx, value, maxWidth) {
  if (!value) return [""];
  const words = value.split(" ");
  const lines = [];
  let line = "";

  for (const w of words) {
    const test = line + w + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w + " ";
    } else {
      line = test;
    }
  }

  if (line) lines.push(line);
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

  // route background support
  let bgApplied = false;
  const routeMatch = String(location).match(/Route\s+(\d+)/i);
  if (routeMatch) {
    const n = routeMatch[1];
    const p = path.join(BG_DIR, `route-${n}.png`);
    if (fs.existsSync(p)) {
      const bg = await loadImage(p);
      ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
      bgApplied = true;
    }
  }

  if (!bgApplied) {
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
  const panelH = innerHeight - 160; // room for route bar below

  // main panel
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, panelW, panelH, 40);
  ctx.fillStyle = "rgba(50, 50, 50, 0.70)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  // ───────────────────────────
  // TEXT LAYOUT
  // ───────────────────────────
  const LABEL_COLOR = "#facc15";
  const VALUE_COLOR = "#ffffff";
  const FONT_SIZE = 55;
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  const lineHeight = FONT_SIZE * 1.25;

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

  const labelX = leftX + 60;
  const maxValueW = panelW - 300;

  // Step 1 — measure total height needed
  let totalHeight = 0;
  const rows = [];
  for (const f of fields) {
    if (f.spacer) {
      rows.push({ spacer: true });
      totalHeight += lineHeight * 0.55;
      continue;
    }

    let lines = [f.value];
    if (f.wrap) lines = wrapValue(ctx, f.value, maxValueW);

    rows.push({ label: f.label, lines });
    totalHeight += lines.length * lineHeight;
  }

  // Step 2 — center vertically
  let currentY = leftY + (panelH - totalHeight) / 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Step 3 — draw
  for (const r of rows) {
    if (r.spacer) {
      currentY += lineHeight * 0.55;
      continue;
    }

    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(r.label, labelX, currentY);

    ctx.fillStyle = VALUE_COLOR;
    const valueX = labelX + ctx.measureText(r.label).width + 40;

    for (let i = 0; i < r.lines.length; i++) {
      const line = r.lines[i];
      if (i > 0) currentY += lineHeight;
      ctx.fillText(line, valueX, currentY);
    }
    currentY += lineHeight;
  }

  // ───────────────────────────
  // SPRITE (unchanged scale)
  // ───────────────────────────
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

  // ───────────────────────────
  // ROUTE BAR (unchanged)
  // ───────────────────────────
  const routeH = 120;
  const routeX = MARGIN;
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
  ctx.fillStyle = "#000";
  ctx.fillText(location || "Unknown Route", routeX + routeW / 2, routeY + routeH / 2);

  // Save 🧃
  const safe =
    pokemonName?.toLowerCase()?.replace(/[^a-z0-9]+/g, "-") || "pokemon";
  const file = path.join(REPORT_DIR, `report_${safe}_${Date.now()}.png`);
  fs.writeFileSync(file, canvas.toBuffer("image/png"));
  return file;
}

module.exports = { createReportCard };

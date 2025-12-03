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

  const spritePath = path.join(SPRITES_DIR, `${pokemonName}.png`);
  if (!fs.existsSync(spritePath)) return;

  const img = await loadImage(spritePath);

  const imgRatio = img.width / img.height;
  const boxRatio = spriteW / spriteH;

  let drawW = spriteW;
  let drawH = spriteH;

  // Fit sprite into the box while keeping aspect ratio
  if (imgRatio > boxRatio) {
    drawH = drawW / imgRatio;
  } else {
    drawW = drawH * imgRatio;
  }

  const dx = x + (spriteW - drawW) / 2;
  const dy = y + (spriteH - drawH) / 2;

  // Crisp pixel-art
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

// Simple slug for route filenames
function slugifyRoute(location) {
  return String(location || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

// Wrap helper (used only for Pokémon + Rarity)
function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
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

  // ──────────────────────────────
  // BACKGROUND (route image if present)
  // ──────────────────────────────
  const routeSlug = slugifyRoute(location);
  const bgPath = path.join(BG_DIR, `${routeSlug}.png`);

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

  // Main panel ~58% of inner width (as before)
  const leftW = Math.floor(innerWidth * 0.58);
  const rightW = innerWidth - leftW;

  const leftX = MARGIN;
  const leftY = MARGIN;

  // Leave vertical space for route bar
  const panelW = leftW;
  const panelH = innerHeight - 160;

  // ──────────────────────────────
  // MAIN INFO PANEL
  // ──────────────────────────────
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, panelW, panelH, 40);
  ctx.fillStyle = "rgba(50, 50, 50, 0.70)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  const LABEL_COLOR = "#facc15"; // gold
  const VALUE_COLOR = "#ffffff";

  const FONT_SIZE = 55; // requested
  const lineHeight = FONT_SIZE * 1.25;
  const spacerGap = lineHeight * 0.5;

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Mark which fields should wrap
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

  // Compute maximum label width so all values align on same X
  let maxLabelWidth = 0;
  for (const f of fields) {
    if (f.spacer || !f.label) continue;
    const w = ctx.measureText(f.label).width;
    if (w > maxLabelWidth) maxLabelWidth = w;
  }

  const labelX = leftX + 60;
  const valueX = labelX + maxLabelWidth + 40;
  const maxValueWidth = panelW - (valueX - leftX) - 40;

  // First pass: measure total text height (so we can center in Y)
  let measureY = 0;
  for (const f of fields) {
    if (f.spacer) {
      measureY += spacerGap;
      continue;
    }
    if (f.wrap) {
      const lines = wrapText(ctx, f.value, maxValueWidth);
      measureY += lineHeight * lines.length;
    } else {
      measureY += lineHeight;
    }
  }

  let currentY = leftY + (panelH - measureY) / 2 + lineHeight * 0.1; // slight nudge

  // Second pass: actually draw
  for (const f of fields) {
    if (f.spacer) {
      currentY += spacerGap;
      continue;
    }

    const label = f.label || "";
    const value = f.value ?? "";

    // Label
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(label, labelX, currentY);

    // Value
    ctx.fillStyle = VALUE_COLOR;

    if (f.wrap) {
      const lines = wrapText(ctx, value, maxValueWidth);
      if (lines.length > 0) {
        // First line shares baseline with label
        ctx.fillText(lines[0], valueX, currentY);
        let extraY = currentY + lineHeight;
        for (let i = 1; i < lines.length; i++) {
          ctx.fillText(lines[i], valueX, extraY);
          extraY += lineHeight;
        }
        currentY = extraY;
      } else {
        currentY += lineHeight;
      }
    } else {
      ctx.fillText(value, valueX, currentY);
      currentY += lineHeight;
    }
  }

  // ──────────────────────────────
  // SPRITE (same placement as old “good” version)
  // ──────────────────────────────
  const spritePadding = 60;
  const spriteW = rightW - spritePadding * 2;
  const spriteH = panelH - spritePadding * 2;

  await drawSprite(
    ctx,
    leftX + panelW + spritePadding, // to the right of panel
    leftY + spritePadding,          // centered vertically by box
    spriteW,
    spriteH,
    pokemonName
  );

  // ──────────────────────────────
  // FULL-WIDTH ROUTE BAR
  // ──────────────────────────────
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

  const routeFontSize = Math.round(FONT_SIZE * 1.2); // ~20% bigger than main
  ctx.font = `bold ${routeFontSize}px sans-serif`;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(location || "Unknown Route", routeX + routeW / 2, routeY + routeH / 2);

  // ──────────────────────────────
  // SAVE FILE
  // ──────────────────────────────
  const safeName =
    pokemonName?.toLowerCase()?.replace(/[^a-z0-9]+/g, "-") || "pokemon";
  const outPath = path.join(REPORT_DIR, `report_${safeName}_${Date.now()}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  return outPath;
}

module.exports = { createReportCard };

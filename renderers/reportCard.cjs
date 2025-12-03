// renderers/reportCard.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;

// Directories
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

// Simple word-wrap helper (returns array of lines)
function wrapText(ctx, text, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let current = "";

  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
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

  if (imgRatio > boxRatio) {
    // wider than tall
    drawH = drawW / imgRatio;
  } else {
    // taller than wide
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

  // ──────────────────────────────
  // BACKGROUND (route image if available)
  // ──────────────────────────────
  let bgDrawn = false;

  if (location) {
    const routeMatch = String(location).match(/Route\s+(\d+)/i);
    if (routeMatch) {
      const routeNumber = routeMatch[1]; // "1", "23", etc.
      const bgFile = `route-${routeNumber}.png`;
      const bgPath = path.join(BG_DIR, bgFile);

      if (fs.existsSync(bgPath)) {
        try {
          const bgImg = await loadImage(bgPath);
          ctx.drawImage(bgImg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
          bgDrawn = true;
        } catch {
          bgDrawn = false;
        }
      }
    }
  }

  if (!bgDrawn) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  // ──────────────────────────────
  // LAYOUT
  // ──────────────────────────────
  const OUTER_MARGIN = Math.round(CARD_WIDTH * 0.05); // 5% margin around edges

  const innerWidth = CARD_WIDTH - OUTER_MARGIN * 2;
  const innerHeight = CARD_HEIGHT - OUTER_MARGIN * 2;

  // Main panel width ~8% wider than the old 50%
  const leftW = Math.floor(innerWidth * 0.53);
  const rightW = innerWidth - leftW;

  const leftX = OUTER_MARGIN;
  const rightX = leftX + leftW;
  const topY = OUTER_MARGIN;

  const routeH = 120;
  const verticalGap = 40;

  const panelW = leftW;
  const panelH = innerHeight - routeH - verticalGap;

  // ──────────────────────────────
  // LEFT PANEL — main info
  // ──────────────────────────────
  ctx.save();
  roundedRectPath(ctx, leftX, topY, panelW, panelH, 40);
  ctx.fillStyle = "rgba(60, 60, 60, 0.70)"; // 70% opacity
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  // TEXT SETTINGS
  const LABEL_COLOR = "#facc15"; // gold
  const VALUE_COLOR = "#ffffff";
  const FONT_SIZE = 66;
  const lineHeight = FONT_SIZE * 1.28;

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

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
    { label: "Status:", value: statusText || "Active" }
  ];

  // Column positions & widths
  const PANEL_INNER_LEFT_PAD = 70;
  const PANEL_INNER_RIGHT_PAD = 60;
  const labelX = leftX + PANEL_INNER_LEFT_PAD;
  const labelGap = 45;

  // Max label width
  let maxLabelWidth = 0;
  for (const f of fields) {
    if (!f.spacer && f.label) {
      const w = ctx.measureText(f.label).width;
      if (w > maxLabelWidth) maxLabelWidth = w;
    }
  }

  const valueX = labelX + maxLabelWidth + labelGap;
  const maxValueWidth = panelW - (valueX - leftX) - PANEL_INNER_RIGHT_PAD;

  const spacerHeight = lineHeight * 0.55;

  // Pre-process fields with wrapping so we can centre vertically
  const processed = [];
  let totalTextHeight = 0;

  for (const f of fields) {
    if (f.spacer) {
      processed.push({ type: "spacer" });
      totalTextHeight += spacerHeight;
      continue;
    }

    const valueLines = wrapText(ctx, f.value || "", maxValueWidth, lineHeight);
    processed.push({
      type: "field",
      label: f.label,
      lines: valueLines
    });
    totalTextHeight += valueLines.length * lineHeight;
  }

  // Vertically centre the whole block within the panel
  let currentY = topY + (panelH - totalTextHeight) / 2;

  // Draw labels + wrapped values
  for (const item of processed) {
    if (item.type === "spacer") {
      currentY += spacerHeight;
      continue;
    }

    const { label, lines } = item;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Label only on the first line of this field
      if (i === 0 && label) {
        ctx.fillStyle = LABEL_COLOR;
        ctx.fillText(label, labelX, currentY);
      }

      // Value line
      ctx.fillStyle = VALUE_COLOR;
      ctx.fillText(line, valueX, currentY);

      currentY += lineHeight;
    }
  }

  // ──────────────────────────────
  // SPRITE — right side, fixed scale per card size
  // ──────────────────────────────
  const spritePadding = 60;
  const spriteW = rightW - spritePadding * 2;
  const spriteH = panelH - spritePadding * 2;

  await drawSprite(
    ctx,
    rightX + spritePadding,
    topY + spritePadding,
    spriteW,
    spriteH,
    pokemonName
  );

  // ──────────────────────────────
  // FULL-WIDTH ROUTE BOX (unchanged)
  // ──────────────────────────────
  const routeX = OUTER_MARGIN;
  const routeY = CARD_HEIGHT - OUTER_MARGIN - routeH;
  const routeW = innerWidth;

  ctx.save();
  roundedRectPath(ctx, routeX, routeY, routeW, routeH, 35);
  ctx.fillStyle = "#ffffff"; // solid white
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  ctx.font = `bold ${FONT_SIZE + 20}px sans-serif`;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(location || "Unknown Route", routeX + routeW / 2, routeY + routeH / 2);

  // Save file
  const safe =
    pokemonName?.toLowerCase()?.replace(/[^a-z0-9]+/g, "-") || "pokemon";
  const filePath = path.join(REPORT_DIR, `report_${safe}_${Date.now()}.png`);
  fs.writeFileSync(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

module.exports = { createReportCard };
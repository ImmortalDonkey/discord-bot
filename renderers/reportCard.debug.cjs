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

// Semantic colours
const NAME_COLORS = {
  discord: "#38bdf8", // cyan
  ign: "#f59e0b"      // amber
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

  if (imgRatio > boxRatio) {
    drawH = drawW / imgRatio;
  } else {
    drawW = drawH * imgRatio;
  }

  const dx = x + (spriteW - drawW) / 2;
  const dy = y + (spriteH - drawH) / 2;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function slugifyRoute(location) {
  return String(location || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

async function createReportCard(report) {
  const {
    // Narrative control
    reportType = "encounter", // "encounter" | "sighting"
    reporterName,
    reporterType = "discord",
    encountererName,
    encountererType = "discord",

    // Data
    pokemonName,
    location,
    rarityKey,
    rarityLabel,
    points,
    trainerRank,
    statusText
  } = report;

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // ──────────────────────────────
  // BACKGROUND
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

  const leftW = Math.floor(innerWidth * 0.58);
  const rightW = innerWidth - leftW;

  const leftX = MARGIN;
  const leftY = MARGIN;
  const panelW = leftW;
  const panelH = innerHeight - 160;

  // ──────────────────────────────
  // MAIN PANEL
  // ──────────────────────────────
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, panelW, panelH, 40);
  ctx.fillStyle = "rgba(50, 50, 50, 0.70)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#ffffff";
  ctx.stroke();
  ctx.restore();

  const FONT_SIZE = 55;
  const lineHeight = FONT_SIZE * 1.25;
  const spacerGap = lineHeight * 0.6;

  const LABEL_COLOR = "#facc15";
  const VALUE_COLOR = "#ffffff";

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const contentX = leftX + 60;
  const contentW = panelW - 120;

  let cursorY = leftY + 90;

  // ──────────────────────────────
  // NARRATIVE PARAGRAPH (PRIMARY)
  // ──────────────────────────────
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;

  if (reportType === "sighting") {
    // "<Reporter> reported that <Encounterer> encountered a wild <Pokemon> on <Route>"
    ctx.fillStyle = NAME_COLORS[reporterType];
    ctx.fillText(reporterName, contentX, cursorY);

    let offsetX = contentX + ctx.measureText(reporterName).width + 12;
    ctx.fillStyle = VALUE_COLOR;
    ctx.fillText("reported that", offsetX, cursorY);

    offsetX += ctx.measureText("reported that").width + 12;
    ctx.fillStyle = NAME_COLORS[encountererType];
    ctx.fillText(encountererName, offsetX, cursorY);

    offsetX += ctx.measureText(encountererName).width + 12;
    ctx.fillStyle = VALUE_COLOR;
    ctx.fillText(
      `encountered a wild ${pokemonName} on ${location}`,
      offsetX,
      cursorY
    );
  } else {
    // "<Encounterer> encountered a wild <Pokemon> on <Route>"
    ctx.fillStyle = NAME_COLORS[encountererType];
    ctx.fillText(encountererName, contentX, cursorY);

    let offsetX = contentX + ctx.measureText(encountererName).width + 12;
    ctx.fillStyle = VALUE_COLOR;
    ctx.fillText(
      `encountered a wild ${pokemonName} on ${location}`,
      offsetX,
      cursorY
    );
  }

  cursorY += lineHeight * 1.9;

  // ──────────────────────────────
  // METADATA TABLE (SECONDARY)
  // ──────────────────────────────
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;

  const fields = [
    { label: "Rank:", value: trainerRank },
    { spacer: true },
    { label: "Rarity:", value: rarityLabel },
    { spacer: true },
    { label: "Points Awarded:", value: String(points || 0) },
    { spacer: true },
    { label: "Status:", value: statusText || "Active" }
  ];

  let maxLabelWidth = 0;
  for (const f of fields) {
    if (f.spacer) continue;
    maxLabelWidth = Math.max(maxLabelWidth, ctx.measureText(f.label).width);
  }

  const labelX = contentX;
  const valueX = labelX + maxLabelWidth + 40;

  for (const f of fields) {
    if (f.spacer) {
      cursorY += spacerGap;
      continue;
    }

    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(f.label, labelX, cursorY);

    ctx.fillStyle = VALUE_COLOR;
    ctx.fillText(f.value ?? "", valueX, cursorY);

    cursorY += lineHeight;
  }

  // ──────────────────────────────
  // SPRITE
  // ──────────────────────────────
  const spritePadding = 60;
  const spriteW = rightW - spritePadding * 2;
  const spriteH = panelH - spritePadding * 2;

  await drawSprite(
    ctx,
    leftX + panelW + spritePadding,
    leftY + spritePadding,
    spriteW,
    spriteH,
    pokemonName
  );

  // ──────────────────────────────
  // ROUTE BAR
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

  const routeFontSize = Math.round(FONT_SIZE * 1.2);
  ctx.font = `bold ${routeFontSize}px sans-serif`;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(location || "Unknown Route", routeX + routeW / 2, routeY + routeH / 2);

  // ──────────────────────────────
  // SAVE
  // ──────────────────────────────
  const safeName =
    pokemonName?.toLowerCase()?.replace(/[^a-z0-9]+/g, "-") || "pokemon";
  const outPath = path.join(
    REPORT_DIR,
    `report_debug_${safeName}_${Date.now()}.png`
  );

  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  return outPath;
}

module.exports = { createReportCard };
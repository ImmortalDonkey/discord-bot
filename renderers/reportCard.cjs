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
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

async function drawSprite(ctx, x, y, w, h, name) {
  const p = path.join(SPRITES_DIR, `${name}.png`);
  if (!fs.existsSync(p)) return;

  const img = await loadImage(p);
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let drawW = w, drawH = h;

  if (imgRatio > boxRatio) drawH = drawW / imgRatio;
  else drawW = drawH * imgRatio;

  ctx.drawImage(
    img,
    x + (w - drawW) / 2,
    y + (h - drawH) / 2,
    drawW, drawH
  );
}

function wrapValue(ctx, text, max) {
  const words = text.split(" ");
  let line = "";
  const lines = [];

  for (const w of words) {
    const test = line + w + " ";
    if (ctx.measureText(test).width > max && line !== "") {
      lines.push(line.trim());
      line = w + " ";
    } else {
      line = test;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

async function createReportCard(r) {
  const {
    trainerName,
    trainerRank,
    pokemonName,
    rarityKey,
    rarityLabel,
    points,
    location,
    statusText
  } = r;

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // 🔥 GENERIC BACKGROUND FILE SUPPORT
  const bgFile = String(location || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "") + ".png";

  const bgPath = path.join(BG_DIR, bgFile);
  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  const innerW = CARD_WIDTH - MARGIN * 2;
  const innerH = CARD_HEIGHT - MARGIN * 2;

  const panelW = Math.floor(innerW * 0.58);
  const panelH = innerH - 160;
  const panelX = MARGIN;
  const panelY = MARGIN;

  ctx.save();
  roundedRectPath(ctx, panelX, panelY, panelW, panelH, 40);
  ctx.fillStyle = "rgba(50, 50, 50, 0.70)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#fff";
  ctx.stroke();
  ctx.restore();

  const LABEL_COLOR = "#facc15";
  const VALUE_COLOR = "#ffffff";
  const FONT_SIZE = 55;
  const lineHeight = FONT_SIZE * 1.25;
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;

  const rows = [
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

  // 🔥 Determine max label width for aligned values
  let maxLabelW = 0;
  for (const r of rows) {
    if (!r.label) continue;
    const w = ctx.measureText(r.label).width;
    if (w > maxLabelW) maxLabelW = w;
  }

  const labelX = panelX + 60;
  const valueX = labelX + maxLabelW + 40;
  const maxValueW = panelW - (valueX - panelX) - 60;

  let totalHeight = 0;
  const measured = rows.map(f => {
    if (f.spacer) return { spacer: true, h: lineHeight * 0.55 };
    if (f.wrap) {
      const lines = wrapValue(ctx, f.value, maxValueW);
      return { label: f.label, lines, h: lines.length * lineHeight };
    }
    return { label: f.label, lines: [f.value], h: lineHeight };
  });

  measured.forEach(m => totalHeight += m.h);
  let y = panelY + (panelH - totalHeight) / 2;

  measured.forEach(m => {
    if (m.spacer) {
      y += m.h;
      return;
    }

    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(m.label, labelX, y);

    ctx.fillStyle = VALUE_COLOR;
    m.lines.forEach((line, i) => {
      ctx.fillText(line, valueX, y + (i * lineHeight));
    });

    y += m.h;
  });

  const spriteX = panelX + panelW + 90;
  const spriteY = panelY + 60;
  const spriteW = innerW - panelW - 160;
  const spriteH = panelH - 120;
  await drawSprite(ctx, spriteX, spriteY, spriteW, spriteH, pokemonName);

  const routeW = innerW;
  const routeH = 120;
  const routeX = MARGIN;
  const routeY = CARD_HEIGHT - MARGIN - routeH;

  ctx.save();
  roundedRectPath(ctx, routeX, routeY, routeW, routeH, 35);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#fff";
  ctx.stroke();
  ctx.restore();

  ctx.font = `bold ${FONT_SIZE + 20}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";
  ctx.fillText(location || "Unknown Location", routeX + routeW / 2, routeY + routeH / 2);

  const safe = pokemonName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const out = path.join(REPORT_DIR, `report_${safe}_${Date.now()}.png`);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  return out;
}

module.exports = { createReportCard };

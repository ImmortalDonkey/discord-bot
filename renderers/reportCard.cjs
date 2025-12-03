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

// Rarity outline colours
const rarityOutline = {
  paradox: "#a855f7",
  roamerMonth: "#ec4899",
  legendary: "#22d3ee",
  rare: "#22d3ee",
  common: "#16a34a",
};

// Light grey 50% transparency box background
const BOX_BG = "rgba(255,255,255,0.5)";
const BOX_RADIUS = 40;

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

function getSpritePathForPokemon(name) {
  if (!name) return null;
  return path.join(SPRITES_DIR, `${name}.png`);
}

async function drawSprite(ctx, pokemonName, canvasW, canvasH) {
  const spritePath = getSpritePathForPokemon(pokemonName);
  let img = null;

  if (spritePath && fs.existsSync(spritePath)) {
    try { img = await loadImage(spritePath); }
    catch {}
  }

  if (!img) return;

  // Draw sprite floating over background
  const targetW = canvasW * 0.28;
  const ratio = img.height / img.width;
  const targetH = targetW * ratio;

  const x = canvasW * 0.62;
  const y = canvasH * 0.20;

  ctx.drawImage(img, x, y, targetW, targetH);
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
    statusText,
    backgroundImagePath
  } = report;

  const outlineColor = rarityOutline[rarityKey] || "#ffffff";

  // Canvas
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background route image
  if (backgroundImagePath && fs.existsSync(backgroundImagePath)) {
    const bg = await loadImage(backgroundImagePath);
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  // Text font settings
  const FONT_SIZE = 60;
  const LH = FONT_SIZE * 1.25;
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;

  // LEFT PANEL (full height)
  const leftX = MARGIN;
  const leftY = MARGIN;
  const leftW = CARD_WIDTH * 0.55;
  const leftH = CARD_HEIGHT - MARGIN * 2;

  // Transparent box
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, leftW, leftH, BOX_RADIUS);
  ctx.fillStyle = BOX_BG;               // 50% grey
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = outlineColor;       // rarity outline
  ctx.stroke();
  ctx.restore();

  // Text rows
  const rows = [
    { label: "Trainer:", value: trainerName },
    { label: "Rank:", value: trainerRank },
    {},
    { label: "Pokémon:", value: pokemonName },
    {},
    { label: "Rarity:", value: rarityLabel },
    {},
    { label: "Points:", value: String(points) },
    {},
    { label: "Status:", value: statusText }
  ];

  let labelMaxW = 0;
  for (const r of rows) {
    if (!r.label) continue;
    const w = ctx.measureText(r.label).width;
    if (w > labelMaxW) labelMaxW = w;
  }

  const labelX = leftX + 60;
  const gap = 40;
  const valueX = labelX + labelMaxW + gap;

  // Dynamic vertical centering
  const activeRows = rows.filter(r => r.label).length;
  const spacerCount = rows.length - activeRows;
  const totalHeight = activeRows * LH + spacerCount * (LH * 0.6);
  let y = leftY + (leftH - totalHeight) / 2;

  for (const r of rows) {
    if (!r.label) {
      y += LH * 0.6;
      continue;
    }
    ctx.fillStyle = outlineColor;
    ctx.fillText(r.label, labelX, y);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(r.value, valueX, y);
    y += LH;
  }

  // ROUTE BOX bottom right
  const brW = CARD_WIDTH * 0.30;
  const brH = 200;
  const brX = CARD_WIDTH - brW - MARGIN;
  const brY = CARD_HEIGHT - brH - MARGIN;

  ctx.save();
  roundedRectPath(ctx, brX, brY, brW, brH, BOX_RADIUS);
  ctx.fillStyle = BOX_BG;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${FONT_SIZE + 10}px sans-serif`;

  const lines = wrapText(ctx, location, brW - 100, LH);
  let ry = brY + (brH - lines.length * LH) / 2 + LH * 0.25;
  for (const line of lines) {
    ctx.fillText(line, brX + brW / 2, ry);
    ry += LH;
  }

  // Draw sprite floating over background
  await drawSprite(ctx, pokemonName, CARD_WIDTH, CARD_HEIGHT);

  // Save
  const safe = pokemonName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const file = path.join(REPORT_DIR, `report_${safe}_${Date.now()}.png`);
  fs.writeFileSync(file, canvas.toBuffer("image/png"));
  return file;
}

module.exports = { createReportCard };
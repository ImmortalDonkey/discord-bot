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

/* ────────────────────────────── */
/* COLOURS                        */
/* ────────────────────────────── */

const rarityOutline = {
  common: "#4ade80",
  rare: "#38bdf8",
  legendary: "#22d3ee",
  roamerMonth: "#ec4899",
  paradox: "#a855f7"
};

const rarityTextColors = {
  common: "#bbf7d0",
  rare: "#bae6fd",
  legendary: "#a5f3fc",
  roamerMonth: "#fbcfe8",
  paradox: "#e9d5ff"
};

const rarityGlowStrength = {
  common: 6,
  rare: 12,
  legendary: 16,
  roamerMonth: 24,
  paradox: 28
};

const RANK_COLORS = {
  "Rookie Trainer": "#86efac",
  Trainer: "#7dd3fc",
  "Ace Trainer": "#93c5fd",
  "Gym Challenger": "#fde047",
  "Gym Leader": "#fb923c",
  "Elite Four": "#f472b6",
  Champion: "#c084fc",
  Master: "#f0abfc"
};

const STATUS_COLORS = {
  active: "#4ade80",
  expired: "#ef4444"
};

function hasRankGlow(rank) {
  return ["Gym Leader", "Elite Four", "Champion", "Master"].includes(rank);
}

/* ────────────────────────────── */
/* HELPERS                        */
/* ────────────────────────────── */

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

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
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
  return lines;
}

/* ────────────────────────────── */
/* MAIN                           */
/* ────────────────────────────── */

async function createReportCard(report) {
  const {
    reporterName,
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

  /* BACKGROUND */
  const bgPath = path.join(
    BG_DIR,
    String(location).toLowerCase().replace(/\s+/g, "-") + ".png"
  );

  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  const innerW = CARD_WIDTH - MARGIN * 2;
  const innerH = CARD_HEIGHT - MARGIN * 2;
  const leftW = Math.floor(innerW * 0.58);
  const rightW = innerW - leftW;

  const leftX = MARGIN;
  const leftY = MARGIN;
  const panelH = innerH - 160;

  /* PANEL */
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, leftW, panelH, 40);
  ctx.fillStyle = "rgba(35,35,35,0.72)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#fff";
  ctx.stroke();
  ctx.restore();

  /* TEXT CONFIG */
  const FONT_SIZE = 66;
  const lineHeight = FONT_SIZE * 1.3;

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const contentX = leftX + 60;
  const contentW = leftW - 120;

  /* ───────── NARRATIVE (FIXED) ───────── */

  const narrativeStatic = " has found a roaming ";
  const narrativeFull =
    reporterName + narrativeStatic + pokemonName;

  const narrativeLines = wrapText(ctx, narrativeFull, contentW);

  /* META */
  const rarityLines = wrapText(ctx, rarityLabel, contentW * 0.6);

  const metaHeight =
    (1 + rarityLines.length + 2) * lineHeight + lineHeight * 0.4;

  const narrativeHeight = narrativeLines.length * lineHeight;
  const totalHeight =
    narrativeHeight + lineHeight * 0.8 + metaHeight;

  let cursorY = leftY + (panelH - totalHeight) / 2;

  /* DRAW NARRATIVE */
  for (const line of narrativeLines) {
    let x = contentX;

    // Username
    if (line.startsWith(reporterName)) {
      ctx.save();
      ctx.fillStyle = RANK_COLORS[trainerRank] || "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 6;
      ctx.strokeText(reporterName, x, cursorY);
      if (hasRankGlow(trainerRank)) {
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 20;
      }
      ctx.fillText(reporterName, x, cursorY);
      ctx.restore();

      x += ctx.measureText(reporterName).width;
    }

    // Static text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(narrativeStatic, x, cursorY);
    x += ctx.measureText(narrativeStatic).width;

    // Pokémon name
    ctx.save();
    ctx.fillStyle = rarityTextColors[rarityKey] || "#ffffff";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = rarityGlowStrength[rarityKey] || 12;
    ctx.fillText(pokemonName, x, cursorY);
    ctx.restore();

    cursorY += lineHeight;
  }

  cursorY += lineHeight * 0.8;

  /* META */
  const LABEL_COLOR = "#facc15";
  let maxLabel = 0;

  const meta = [
    ["Rank:", trainerRank],
    ["Rarity:", rarityLabel],
    ["Points:", String(points)],
    ["Status:", statusText || "Active"]
  ];

  for (const [label] of meta) {
    maxLabel = Math.max(maxLabel, ctx.measureText(label).width);
  }

  for (const [label, value] of meta) {
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(label, contentX, cursorY);

    if (label === "Rarity:") {
      ctx.fillStyle = "#ffffff";
      for (const l of rarityLines) {
        ctx.fillText(l, contentX + maxLabel + 40, cursorY);
        cursorY += lineHeight;
      }
      continue;
    }

    ctx.fillStyle =
      label === "Status:"
        ? STATUS_COLORS[value.toLowerCase()] || "#ffffff"
        : "#ffffff";

    ctx.fillText(value, contentX + maxLabel + 40, cursorY);
    cursorY += lineHeight;

    if (label === "Points:") cursorY += lineHeight * 0.4;
  }

  /* SPRITE */
  const spritePath = path.join(SPRITES_DIR, `${pokemonName}.png`);
  if (fs.existsSync(spritePath)) {
    const sprite = await loadImage(spritePath);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sprite,
      leftX + leftW + 60,
      leftY + 60,
      rightW - 120,
      panelH - 120
    );
  }

  /* ROUTE BAR */
  const barY = CARD_HEIGHT - MARGIN - 120;
  ctx.save();
  roundedRectPath(ctx, MARGIN, barY, innerW, 120, 35);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#fff";
  ctx.stroke();
  ctx.restore();

  ctx.font = `bold ${Math.round(FONT_SIZE * 1.2)}px sans-serif`;
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(location, CARD_WIDTH / 2, barY + 60);

  const outPath = path.join(REPORT_DIR, `report_debug_${Date.now()}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  return outPath;
}

module.exports = { createReportCard };
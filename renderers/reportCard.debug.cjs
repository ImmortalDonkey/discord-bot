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

const NAME_COLORS = {
  discord: "#38bdf8",
  ign: "#f59e0b",
  system: "#94a3b8"
};

const POKEMON_COLOR = "#f472b6";

const STATUS_COLORS = {
  active: "#4ade80",
  expired: "#ef4444"
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

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(" ");
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

/**
 * Draw a single line, highlighting name + pokemon ONLY if they appear in that line.
 */
function drawNarrativeLine(ctx, line, x, y, opts) {
  const {
    valueColor,
    name,
    nameColor,
    pokemon,
    pokemonColor
  } = opts;

  let cursorX = x;
  let remaining = String(line || "");

  // Highlight name if present in this line
  if (name && remaining.includes(name)) {
    const parts = remaining.split(name);
    const before = parts.shift() || "";
    const after = parts.join(name); // in case name appears multiple times

    ctx.fillStyle = valueColor;
    if (before) {
      ctx.fillText(before, cursorX, y);
      cursorX += ctx.measureText(before).width;
    }

    ctx.fillStyle = nameColor;
    ctx.fillText(name, cursorX, y);
    cursorX += ctx.measureText(name).width;

    remaining = after;
  }

  // Highlight pokemon if present in the remaining text
  if (pokemon && remaining.includes(pokemon)) {
    const parts = remaining.split(pokemon);
    const before = parts.shift() || "";
    const after = parts.join(pokemon);

    ctx.fillStyle = valueColor;
    if (before) {
      ctx.fillText(before, cursorX, y);
      cursorX += ctx.measureText(before).width;
    }

    ctx.fillStyle = pokemonColor;
    ctx.fillText(pokemon, cursorX, y);
    cursorX += ctx.measureText(pokemon).width;

    ctx.fillStyle = valueColor;
    if (after) ctx.fillText(after, cursorX, y);

    return;
  }

  // No pokemon in this line, just draw remaining normally
  ctx.fillStyle = valueColor;
  if (remaining) ctx.fillText(remaining, cursorX, y);
}

async function createReportCard(report) {
  const {
    reportType,
    reporterName,
    reporterType,
    encountererName,
    encountererType,
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

  // ───────── BACKGROUND ─────────
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

  // ───────── PANEL ─────────
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, leftW, panelH, 40);
  ctx.fillStyle = "rgba(50,50,50,0.7)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#fff";
  ctx.stroke();
  ctx.restore();

  // ───────── TEXT CONFIG ─────────
  const FONT_SIZE = Math.round(55 * 1.2);
  const lineHeight = FONT_SIZE * 1.3;

  const LABEL_COLOR = "#facc15";
  const VALUE_COLOR = "#ffffff";

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const contentX = leftX + 60;
  const contentW = leftW - 120;

  // ───────── NARRATIVE ─────────
  // Keep your canonical format for “encounter/vortex”.
  // For sighting, keep the older descriptive flow so /report doesn’t get weird.
  const nameForNarrative =
    String(encountererName || reporterName || "Unknown").trim();

  const prep = /\d$/.test(String(location || "").trim()) ? "on" : "at";

  let narrative = "";
  if (reportType === "sighting") {
    // Reporter is telling us someone (maybe IGN) encountered
    narrative = `${reporterName} reported that ${nameForNarrative} encountered a wild ${pokemonName} ${prep} ${location}`;
  } else {
    // Encounter / vortex / default
    // (This matches your “stick with my existing narrative format” requirement)
    narrative = `${nameForNarrative} has encountered a wild roaming ${pokemonName}`;
  }

  const narrativeLines = wrapText(ctx, narrative, contentW);

  // ───────── META ─────────
  const metaFields = [
    ["Rank:", trainerRank],
    ["Rarity:", rarityLabel],
    ["Points:", String(points)],
    ["Status:", statusText || "Active"]
  ];

  // ───────── HEIGHT CALC (centering) ─────────
  const narrativeHeight = narrativeLines.length * lineHeight;
  const metaRows = 4 + 0.4; // 4 lines + extra spacing after Points
  const metaHeight = metaRows * lineHeight;

  const totalHeight =
    narrativeHeight +
    lineHeight * 0.8 + // gap between narrative + meta
    metaHeight;

  let cursorY = leftY + (panelH - totalHeight) / 2 + lineHeight;

  // ───────── DRAW NARRATIVE (SAFE HIGHLIGHTS) ─────────
  const nameColor =
    NAME_COLORS[encountererType || reporterType] || VALUE_COLOR;

  for (const line of narrativeLines) {
    drawNarrativeLine(ctx, line, contentX, cursorY, {
      valueColor: VALUE_COLOR,
      name: nameForNarrative,
      nameColor,
      pokemon: pokemonName,
      pokemonColor: POKEMON_COLOR
    });

    cursorY += lineHeight;
  }

  cursorY += lineHeight * 0.8;

  // ───────── DRAW META ─────────
  let maxLabel = 0;
  for (const [label] of metaFields) {
    maxLabel = Math.max(maxLabel, ctx.measureText(label).width);
  }

  for (const [label, value] of metaFields) {
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(label, contentX, cursorY);

    ctx.fillStyle =
      label === "Status:"
        ? STATUS_COLORS[String(value || "").toLowerCase()] || VALUE_COLOR
        : VALUE_COLOR;

    ctx.fillText(value, contentX + maxLabel + 40, cursorY);
    cursorY += lineHeight;

    if (label === "Points:") cursorY += lineHeight * 0.4;
  }

  // ───────── SPRITE ─────────
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

  // ───────── ROUTE BAR ─────────
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
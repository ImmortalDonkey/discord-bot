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
  common: "#4ade80",
  rare: "#38bdf8",
  legendary: "#22d3ee",
  paradox: "#a855f7",
  roamerMonth: "#ec4899"
};

const RANK_COLORS = {
  "Rookie Trainer": "#4ade80",
  Trainer: "#38bdf8",
  "Ace Trainer": "#60a5fa",
  "Gym Challenger": "#facc15",
  "Gym Leader": "#f97316",
  "Elite Four": "#ec4899",
  Champion: "#a855f7",
  Master: "#e879f9"
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
  const words = String(text).split(" ");
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

function hasGlow(rank) {
  return ["Gym Leader", "Elite Four", "Champion", "Master"].includes(rank);
}

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
  ctx.fillStyle = "rgba(40,40,40,0.7)";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarityOutline[rarityKey] || "#fff";
  ctx.stroke();
  ctx.restore();

  // ───────── TEXT SETUP ─────────
  const FONT_SIZE = 66;
  const lineHeight = FONT_SIZE * 1.3;

  ctx.font = `bold ${FONT_SIZE}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top"; // ✅ KEY FIX (centering becomes reliable)

  const contentX = leftX + 60;
  const contentW = leftW - 120;

  // ───────── NARRATIVE TOKENS ─────────
  const narrativeTokens = [
    { type: "name", text: reporterName },
    { type: "text", text: " has encountered a wild roaming " },
    { type: "pokemon", text: pokemonName }
  ];

  const narrativeFull = narrativeTokens.map(t => t.text).join("");
  const narrativeLines = wrapText(ctx, narrativeFull, contentW);

  // ───────── META ─────────
  const metaFields = [
    ["Rank:", trainerRank],
    ["Rarity:", rarityLabel],
    ["Points:", String(points)],
    ["Status:", statusText || "Active"]
  ];

  // Pre-wrap rarity once (and reuse for measuring + drawing)
  const rarityWrapped = wrapText(ctx, rarityLabel, contentW * 0.6);

  // ───────── TRUE HEIGHT CALC (CENTERING) ─────────
  const gapAfterNarrative = lineHeight * 0.8;
  const extraAfterPoints = lineHeight * 0.4;

  // Meta lines: Rank (1) + Rarity (N) + Points (1) + Status (1)
  const metaLineCount = 1 + rarityWrapped.length + 1 + 1;

  const narrativeHeight = narrativeLines.length * lineHeight;
  const metaHeight = metaLineCount * lineHeight + extraAfterPoints;

  const totalHeight = narrativeHeight + gapAfterNarrative + metaHeight;

  let cursorY = leftY + (panelH - totalHeight) / 2;

  const nameColor = RANK_COLORS[trainerRank] || "#ffffff";
  const glow = hasGlow(trainerRank);

  // ───────── DRAW NARRATIVE (TOKEN SAFE) ─────────
  for (const line of narrativeLines) {
    let x = contentX;
    let remaining = line;

    for (const token of narrativeTokens) {
      const idx = remaining.indexOf(token.text);
      if (idx === -1) continue;

      const before = remaining.slice(0, idx);
      if (before) {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(before, x, cursorY);
        x += ctx.measureText(before).width;
      }

      ctx.save();
      if (token.type === "name") {
        ctx.fillStyle = nameColor;
        if (glow) {
          ctx.shadowColor = nameColor;
          ctx.shadowBlur = 18;
        }
      } else if (token.type === "pokemon") {
        ctx.fillStyle = POKEMON_COLOR;
      } else {
        ctx.fillStyle = "#ffffff";
      }

      ctx.fillText(token.text, x, cursorY);
      x += ctx.measureText(token.text).width;
      ctx.restore();

      remaining = remaining.slice(idx + token.text.length);
    }

    if (remaining) {
      ctx.fillStyle = "#ffffff";
      ctx.fillText(remaining, x, cursorY);
    }

    cursorY += lineHeight;
  }

  cursorY += gapAfterNarrative;

  // ───────── DRAW META ─────────
  const LABEL_COLOR = "#facc15";

  let maxLabel = 0;
  for (const [label] of metaFields) {
    maxLabel = Math.max(maxLabel, ctx.measureText(label).width);
  }

  for (const [label, value] of metaFields) {
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(label, contentX, cursorY);

    if (label === "Rarity:") {
      ctx.fillStyle = "#ffffff";
      for (const l of rarityWrapped) {
        ctx.fillText(l, contentX + maxLabel + 40, cursorY);
        cursorY += lineHeight;
      }
      continue;
    }

    ctx.fillStyle =
      label === "Status:"
        ? STATUS_COLORS[String(value).toLowerCase()] || "#ffffff"
        : "#ffffff";

    ctx.fillText(value, contentX + maxLabel + 40, cursorY);
    cursorY += lineHeight;

    if (label === "Points:") cursorY += extraAfterPoints;
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
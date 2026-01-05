const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const CARD_WIDTH = 2200;
const CARD_HEIGHT = 1300;

// ───────── OUTER EDGE CONFIG ─────────
const EDGE = 26;
const EDGE_RADIUS = EDGE * 4.6;

const MARGIN = Math.floor(CARD_WIDTH * 0.05);

const REPORT_DIR = path.join(__dirname, "report-images");
const SPRITES_DIR = path.join(__dirname, "..", "sprites");
const BG_DIR = path.join(__dirname, "report-bg");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

/* ────────────────────────────── */
/* COLOURS (RARITY ONLY)          */
/* ────────────────────────────── */

const rarityOutline = {
  common: "#22c55e",
  rare: "#2563eb",
  legendary: "#7c3aed",
  roamerMonth: "#ef4444",
  paradox: "#facc15"
};

const rarityTextColors = {
  common: "#4ade80",
  rare: "#60a5fa",
  legendary: "#a78bfa",
  roamerMonth: "#f87171",
  paradox: "#fde047"
};

const rarityGlowStrength = {
  common: 6,
  rare: 12,
  legendary: 16,
  roamerMonth: 22,
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

function hasRankGlow(rank) {
  return ["Gym Leader", "Elite Four", "Champion", "Master"].includes(rank);
}

const STATUS_COLORS = {
  active: "#4ade80",
  expired: "#ef4444"
};

const EXPIRED_OUTLINE_COLOR = "#9ca3af";

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
    statusText,
    reportCardPrefs
  } = report;

  const isExpired =
    String(statusText || "active").toLowerCase() === "expired";

  const outlineColor = isExpired
    ? EXPIRED_OUTLINE_COLOR
    : reportCardPrefs?.outline_color ||
      rarityOutline[rarityKey] ||
      "#fff";

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // ───────── OUTER CLIP ─────────
  ctx.save();
  roundedRectPath(
    ctx,
    EDGE / 2,
    EDGE / 2,
    CARD_WIDTH - EDGE,
    CARD_HEIGHT - EDGE,
    EDGE_RADIUS
  );
  ctx.clip();

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

  if (isExpired) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  const innerW = CARD_WIDTH - MARGIN * 2;
  const innerH = CARD_HEIGHT - MARGIN * 2;

  const leftW = Math.floor(innerW * 0.58);
  const leftX = MARGIN;
  const leftY = MARGIN;
  const panelH = innerH - 160;

  // ───────── LEFT TEXT PANEL ─────────
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, leftW, panelH, 40);
  ctx.fillStyle = "rgba(35,35,35,0.72)";
  ctx.fill();

  ctx.lineWidth = 20;
  ctx.strokeStyle = outlineColor;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.stroke();

  if (!isExpired && rarityKey === "paradox") {
    ctx.shadowColor = rarityOutline.paradox;
    ctx.shadowBlur = rarityGlowStrength.paradox;
    ctx.stroke();
  }

  ctx.restore();

  // ───────── OUTER CARD OUTLINE ─────────
  ctx.save();
  roundedRectPath(
    ctx,
    EDGE / 2,
    EDGE / 2,
    CARD_WIDTH - EDGE,
    CARD_HEIGHT - EDGE,
    EDGE_RADIUS
  );

  ctx.lineWidth = EDGE;
  ctx.strokeStyle = outlineColor;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.stroke();

  if (!isExpired && rarityKey === "paradox") {
    ctx.shadowColor = rarityOutline.paradox;
    ctx.shadowBlur = rarityGlowStrength.paradox * 1.1;
    ctx.stroke();
  }

  ctx.restore();

  // ───────── ROUTE BAR ─────────
  const barY = CARD_HEIGHT - MARGIN - 120;

  ctx.save();
  roundedRectPath(ctx, MARGIN, barY, innerW, 120, 35);
  ctx.fillStyle = "#fff";
  ctx.fill();

  ctx.lineWidth = 20;
  ctx.strokeStyle = outlineColor;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.stroke();

  if (!isExpired && rarityKey === "paradox") {
    ctx.shadowColor = rarityOutline.paradox;
    ctx.shadowBlur = rarityGlowStrength.paradox;
    ctx.stroke();
  }

  ctx.restore();

  const outPath = path.join(
    REPORT_DIR,
    `report_debug_${Date.now()}.png`
  );

  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  return outPath;
}

module.exports = { createReportCard };
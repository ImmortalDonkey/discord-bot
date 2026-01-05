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
/* RARITY COLOURS (LOCKED)        */
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

  const isExpired = String(statusText).toLowerCase() === "expired";

  const baseOutlineColor =
    reportCardPrefs?.outline_color ||
    rarityOutline[rarityKey] ||
    "#ffffff";

  const outlineColor = isExpired
    ? EXPIRED_OUTLINE_COLOR
    : baseOutlineColor;

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
    ctx.fillStyle = "rgba(0,0,0,0.60)";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  ctx.restore();

  // ───────── OUTER SOLID BORDER ─────────
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
  ctx.stroke();
  ctx.restore();

  // ───────── PARADOX INNER GLOW (FINAL FIX) ─────────
  if (!isExpired && rarityKey === "paradox") {
    ctx.save();

    const inset = EDGE * 0.6;

    roundedRectPath(
      ctx,
      EDGE / 2 + inset,
      EDGE / 2 + inset,
      CARD_WIDTH - EDGE - inset * 2,
      CARD_HEIGHT - EDGE - inset * 2,
      EDGE_RADIUS - inset
    );

    ctx.lineWidth = EDGE * 0.55;
    ctx.strokeStyle = rarityOutline.paradox;

    ctx.shadowColor = rarityOutline.paradox;
    ctx.shadowBlur = rarityGlowStrength.paradox * 0.9;

    ctx.stroke();
    ctx.restore();
  }

  // ───────── ROUTE BAR ─────────
  const barY = CARD_HEIGHT - MARGIN - 120;
  ctx.save();
  roundedRectPath(ctx, MARGIN, barY, CARD_WIDTH - MARGIN * 2, 120, 35);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 20;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();
  ctx.restore();

  ctx.font = "bold 78px sans-serif";
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(location, CARD_WIDTH / 2, barY + 60);

  const outPath = path.join(REPORT_DIR, `report_debug_${Date.now()}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  return outPath;
}

module.exports = { createReportCard };
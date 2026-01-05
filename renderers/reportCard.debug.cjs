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
/* COLOURS                        */
/* ────────────────────────────── */

const rarityOutline = {
  common: "#ffffff",
  rare: "#2563eb",
  legendary: "#7c3aed",
  roamerMonth: "#ef4444",
  paradox: "#facc15"
};

const rarityTextColors = {
  common: "#ffffff",
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

function wrapPlainText(ctx, text, maxWidth) {
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

function wrapStyledTokens(ctx, tokens, maxWidth) {
  const lines = [];
  let current = [];
  let width = 0;

  const pushLine = () => {
    if (current.length) lines.push(current);
    current = [];
    width = 0;
  };

  for (const t of tokens) {
    const parts = String(t.text || "").split(/(\s+)/).filter(Boolean);
    for (const part of parts) {
      const w = ctx.measureText(part).width;
      if (width + w > maxWidth && current.length) pushLine();
      current.push({ text: part, kind: t.kind });
      width += w;
    }
  }

  pushLine();
  return lines;
}

function drawPiece(ctx, text, x, y, kind, theme) {
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  if (kind === "ign") {
    const col = theme.rankColor;
    ctx.save();
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = col;
    if (theme.rankGlow) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 22;
    }
    ctx.fillText(text, x, y);
    ctx.restore();
    return;
  }

  if (kind === "pokemon") {
    const col = theme.pokemonColor;
    ctx.save();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = theme.pokemonGlow;
    ctx.fillText(text, x, y);
    ctx.restore();
    return;
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
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

  const normalisedStatus = String(statusText || "Active").toLowerCase();
  const isExpired = normalisedStatus === "expired";
  const displayStatus = isExpired ? "Expired" : "Active";

  const baseOutlineColor =
    reportCardPrefs?.outline_color ||
    rarityOutline[rarityKey] ||
    "#ffffff";

  const outlineColor = isExpired
    ? EXPIRED_OUTLINE_COLOR
    : baseOutlineColor;

  const shouldGlow = !isExpired && rarityKey === "paradox";

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

  const innerW = CARD_WIDTH - MARGIN * 2;
  const innerH = CARD_HEIGHT - MARGIN * 2;

  const leftW = Math.floor(innerW * 0.58);
  const rightW = innerW - leftW;

  const leftX = MARGIN;
  const leftY = MARGIN;
  const panelH = innerH - 160;

  // ───────── LEFT PANEL ─────────
  ctx.save();
  roundedRectPath(ctx, leftX, leftY, leftW, panelH, 40);
  ctx.fillStyle = "rgba(35,35,35,0.72)";
  ctx.fill();

  ctx.lineWidth = 20;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();

  if (shouldGlow) {
    ctx.lineJoin = "round";

    ctx.globalAlpha = 0.35;
    ctx.shadowColor = "#facc15";
    ctx.shadowBlur = 44;
    ctx.lineWidth = 26;
    ctx.stroke();

    ctx.globalAlpha = 0.65;
    ctx.shadowColor = "#fff4a3";
    ctx.shadowBlur = 22;
    ctx.lineWidth = 18;
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  ctx.restore();

  // ───────── TEXT ─────────
  const FONT_SIZE = 66;
  const lineHeight = FONT_SIZE * 1.3;
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;

  const contentX = leftX + 60;
  const contentW = leftW - 120;

  const ign = String(reporterName || "Unknown");
  const mon = String(pokemonName || "Unknown");

  const narrativeTokens = [
    { kind: "ign", text: ign },
    { kind: "normal", text: " has found a roaming " },
    { kind: "pokemon", text: mon }
  ];

  const narrativeLines = wrapStyledTokens(ctx, narrativeTokens, contentW);

  let cursorY = leftY + 120;

  const theme = {
    rankColor: RANK_COLORS[trainerRank] || "#fff",
    rankGlow: hasRankGlow(trainerRank),
    pokemonColor: rarityTextColors[rarityKey] || "#fff",
    pokemonGlow: rarityGlowStrength[rarityKey] || 14
  };

  for (const line of narrativeLines) {
    let x = contentX;
    for (const piece of line) {
      drawPiece(ctx, piece.text, x, cursorY, piece.kind, theme);
      x += ctx.measureText(piece.text).width;
    }
    cursorY += lineHeight;
  }

  // ───────── OUTER EDGE (UNCHANGED) ─────────
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
  ctx.strokeStyle = isExpired
    ? EXPIRED_OUTLINE_COLOR
    : rarityOutline[rarityKey] || "#fff";
  ctx.stroke();
  ctx.restore();

  // ───────── ROUTE BAR ─────────
  const barY = CARD_HEIGHT - MARGIN - 120;
  ctx.save();
  roundedRectPath(ctx, MARGIN, barY, innerW, 120, 35);
  ctx.fillStyle = "#fff";
  ctx.fill();

  ctx.lineWidth = 20;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();

  if (shouldGlow) {
    ctx.lineJoin = "round";

    ctx.globalAlpha = 0.35;
    ctx.shadowColor = "#facc15";
    ctx.shadowBlur = 40;
    ctx.lineWidth = 26;
    ctx.stroke();

    ctx.globalAlpha = 0.65;
    ctx.shadowColor = "#fff4a3";
    ctx.shadowBlur = 20;
    ctx.lineWidth = 18;
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

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
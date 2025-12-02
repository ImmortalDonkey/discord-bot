// renderers/reportCard.cjs
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

// ============================
// CANVAS & DIRECTORY SETTINGS
// ============================
const WIDTH = 2200;
const HEIGHT = 1300;
const MARGIN = 40;

const REPORT_DIR = path.join(__dirname, "report-images");
const SPRITES_DIR = path.join(__dirname, "..", "sprites");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// ============================
// UTILS
// ============================
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeFilename(pokemon) {
  const safe = pokemon.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return path.join(REPORT_DIR, `report-${safe}-${Date.now()}.png`);
}

// ============================
// MAIN RENDER FUNCTION
// ============================
async function createReportCard(report) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // --------------------------
  // BACKGROUND
  // --------------------------
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#0ea5e9");
  bg.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // MAIN BORDER
  ctx.strokeStyle = "white";
  ctx.lineWidth = 14;
  roundRect(ctx, MARGIN, MARGIN, WIDTH - MARGIN * 2, HEIGHT - MARGIN * 2, 35);
  ctx.stroke();

  // reusable colours
  const boxBG = "#081425";
  const labelYellow = "#facc15";
  const textColor = "white";

  // --------------------------
  // LEFT TOP BIG BOX
  // --------------------------
  const leftX = MARGIN + 20;
  const leftY = MARGIN + 20;
  const leftW = 1320;
  const leftH = 820;

  ctx.fillStyle = boxBG;
  roundRect(ctx, leftX, leftY, leftW, leftH, 35);
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.font = "bold 65px Sans";
  ctx.fillStyle = labelYellow;
  ctx.fillText("Trainer:", leftX + 60, leftY + 110);

  ctx.fillStyle = textColor;
  ctx.fillText(report.trainerName, leftX + 330, leftY + 110);

  ctx.fillStyle = labelYellow;
  ctx.fillText("Rank:", leftX + 60, leftY + 200);

  ctx.fillStyle = textColor;
  ctx.fillText(report.trainerRank, leftX + 330, leftY + 200);

  ctx.font = "bold 70px Sans";
  ctx.fillStyle = textColor;
  ctx.fillText(
    `${report.trainerName} has spotted a wild "${report.pokemonName}"`,
    leftX + 60,
    leftY + 330
  );

  ctx.font = "bold 70px Sans";
  ctx.fillStyle = labelYellow;
  ctx.fillText("Rarity:", leftX + 60, leftY + 480);
  ctx.fillStyle = textColor;
  ctx.fillText(report.rarity, leftX + 330, leftY + 480);

  ctx.fillStyle = labelYellow;
  ctx.fillText("Points awarded:", leftX + 60, leftY + 580);
  ctx.fillStyle = textColor;
  ctx.fillText(String(report.points), leftX + 540, leftY + 580);

  // --------------------------
  // RIGHT POKÉMON IMAGE BOX
  // --------------------------
  const rightX = leftX + leftW + 30;
  const rightY = leftY;
  const rightW = 730;
  const rightH = 820;

  ctx.fillStyle = boxBG;
  roundRect(ctx, rightX, rightY, rightW, rightH, 35);
  ctx.fill();
  ctx.stroke();

  // sprite
  const spritePath = path.join(SPRITES_DIR, report.spriteName);
  try {
    const img = await loadImage(spritePath);
    const scale = Math.min(
      rightW * 0.8 / img.width,
      rightH * 0.8 / img.height
    );
    const sw = img.width * scale;
    const sh = img.height * scale;

    ctx.drawImage(
      img,
      rightX + (rightW - sw) / 2,
      rightY + (rightH - sh) / 2,
      sw,
      sh
    );
  } catch {
    ctx.fillStyle = "white";
    ctx.font = "65px Sans";
    ctx.fillText("Sprite missing", rightX + 70, rightY + 400);
  }

  // --------------------------
  // BOTTOM LEFT BOX — availability
  // --------------------------
  const botLX = leftX;
  const botLY = leftY + leftH + 40;
  const botLW = 1050;
  const botLH = 320;

  ctx.fillStyle = boxBG;
  roundRect(ctx, botLX, botLY, botLW, botLH, 35);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = labelYellow;
  ctx.font = "bold 70px Sans";

  if (report.expired) {
    ctx.fillText("No longer available", botLX + 70, botLY + 180);
  } else {
    ctx.fillText("Available until end of the hour", botLX + 70, botLY + 180);
  }

  // --------------------------
  // BOTTOM RIGHT BOX — route
  // --------------------------
  const botRX = botLX + botLW + 30;
  const botRY = botLY;
  const botRW = 700;
  const botRH = 320;

  ctx.fillStyle = boxBG;
  roundRect(ctx, botRX, botRY, botRW, botRH, 35);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "white";
  ctx.font = "bold 80px Sans";
  ctx.fillText(report.location, botRX + 80, botRY + 190);

  // --------------------------
  // SAVE
  // --------------------------
  const filename = makeFilename(report.pokemonName);
  fs.writeFileSync(filename, canvas.toBuffer("image/png"));
  return filename;
}

module.exports = { createReportCard };

// utils/scoring.cjs

const { rarityPoints } = require('./rarity.cjs');

/**
 * Calculate awarded points for a report.
 *
 * IMPORTANT:
 * - Diminishing / time-based decay logic has been REMOVED.
 * - Full base points are always awarded.
 * - Function signature and export are intentionally unchanged.
 */
function calculateAwardedPoints(rarityKey /*, reportTime */) {
  if (!rarityKey) return 0;

  const basePoints = rarityPoints[rarityKey];

  if (!basePoints) return 0;

  // 🔒 Locked behavior:
  // Always return full base points
  return basePoints;
}

module.exports = {
  calculateAwardedPoints
};
// utils/scoring.cjs

/**
 * Base rarity points (full value for 00–30 minutes)
 */
const rarityPoints = {
  roamerMonth: 30,
  paradox: 200,
  legendary: 20,
  rare: 20,
  common: 1
};

/**
 * Determine points multiplier based on the minute in the hour.
 * @param {number} minute - 0–59
 * @returns {number} multiplier (0.0–1.0)
 */
function getMinuteMultiplier(minute) {
  if (minute < 30) return 1.0;   // 100%
  if (minute < 40) return 0.75;  // 75%
  if (minute < 50) return 0.50;  // 50%
  return 0.10;                   // 10% (minimum 1 point)
}

/**
 * Calculate the awarded points based on rarity + time of hour.
 * Always returns at least 1 point for valid reports.
 *
 * @param {string} rarityKey
 * @param {Date} reportTime
 * @returns {number} final awarded points
 */
function calculateAwardedPoints(rarityKey, reportTime = new Date()) {
  const base = rarityPoints[rarityKey] || 1;
  const minute = reportTime.getMinutes();

  const multiplier = getMinuteMultiplier(minute);
  let final = Math.floor(base * multiplier);

  // Ensure minimum 1 for valid reports
  if (final < 1) final = 1;

  return final;
}

/**
 * Export everything needed by commands/report.cjs
 */
module.exports = {
  rarityPoints,
  calculateAwardedPoints,
  getMinuteMultiplier
};

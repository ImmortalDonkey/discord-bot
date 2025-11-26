// utils/reportValidator.cjs

/**
 * Centralised duplicate detection + hour expiry logic for /report.
 *
 * This module determines:
 * - Whether a report for the same Pokémon already exists in the same hour
 * - The expiry time (end of the current hour)
 * - Labels used by the report card system
 *
 * NOTE:
 * The diminishing-points logic will be added later in a separate patch.
 */

const activeReportRegistry = new Map();
// Map: `${pokemonName.toLowerCase()}` → { hourStamp: "YYYY-MM-DD-HH" }

/**
 * Convert a Date → "YYYY-MM-DD-HH"
 * Used to detect duplicate reports within the SAME hour.
 */
function getHourStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  return `${y}-${m}-${d}-${h}`;
}

/**
 * Compute the exact expiry time: end of the current hour.
 * Returns the actual Date object.
 */
function computeExpiryDate() {
  const now = new Date();
  const expiry = new Date(now);
  expiry.setMinutes(59);
  expiry.setSeconds(59);
  expiry.setMilliseconds(999);
  return expiry;
}

/**
 * Check for duplicates and hour validity.
 *
 * Returns:
 * {
 *   duplicate: boolean,
 *   expiryDate: Date,
 *   expiryLabel: "End of the hour"
 * }
 */
function validateNewReport(pokemonName) {
  const key = pokemonName.toLowerCase();
  const hourStamp = getHourStamp();

  const existing = activeReportRegistry.get(key);

  const duplicate = !!(existing && existing.hourStamp === hourStamp);

  // If not duplicate, register it for this hour
  if (!duplicate) {
    activeReportRegistry.set(key, { hourStamp });
  }

  return {
    duplicate,
    expiryDate: computeExpiryDate(),
    expiryLabel: "End of the hour"
  };
}

module.exports = {
  validateNewReport,
  computeExpiryDate,
  getHourStamp
};

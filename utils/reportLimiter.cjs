// utils/reportLimiter.cjs
// ------------------------------------------------------
// Prevent duplicate Pokémon reports within the same hour
// Works using:
//  - Fast in-memory lastReports Map
//  - Backup validation through SQLite lookup
// ------------------------------------------------------

const { findActiveReportThisHour } = require("../database.cjs");

// Stores Pokémon → hourBlock string
// Example hourBlock: "2025-12-04-19"
const lastReports = new Map();

/**
 * Generate hour block key for a timestamp
 * e.g. 2025-12-04 19:23 → "2025-12-04-19"
 */
function getHourBlock(date = new Date()) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const h = date.getHours().toString().padStart(2, "0");
  return `${y}-${m}-${d}-${h}`;
}

/**
 * Check if Pokémon report is allowed this hour.
 * Fast path: memory map
 * Safe path: database check to persist across bot restarts
 *
 * Returns:
 *  { allowed: true }
 * OR
 *  {
 *    allowed: false,
 *    activeReport,
 *    nextResetUnix,
 *    nextResetLabel
 *  }
 */
async function checkReportAllowed(pokemonName, now = new Date()) {
  if (!pokemonName) {
    return { allowed: false, reason: "Missing Pokémon name" };
  }

  const key = String(pokemonName).toLowerCase();
  const block = getHourBlock(now);

  // Memory check
  const lastBlock = lastReports.get(key);
  if (lastBlock && lastBlock === block) {
    const resetInfo = computeNextReset(now);
    return {
      allowed: false,
      reason: "duplicate-in-memory",
      ...resetInfo
    };
  }

  // DB fallback check — prevents bypass on restart
  const activeRow = await findActiveReportThisHour(key, now.getTime());
  if (activeRow) {
    const resetInfo = computeNextReset(now);
    return {
      allowed: false,
      reason: "duplicate-db",
      activeReport: activeRow,
      ...resetInfo
    };
  }

  // All clear — mark as used
  lastReports.set(key, block);
  return { allowed: true };
}

/**
 * Compute timestamp + Discord friendly countdown for next allowed report
 */
function computeNextReset(now = new Date()) {
  const reset = new Date(now);
  reset.setMinutes(60, 0, 0); // top of next hour

  const nextResetUnix = Math.floor(reset.getTime() / 1000);

  return {
    nextResetUnix,
    nextResetLabel: `<t:${nextResetUnix}:R>` // ":R" = relative time
  };
}

module.exports = {
  checkReportAllowed,
  getHourBlock,
  lastReports
};
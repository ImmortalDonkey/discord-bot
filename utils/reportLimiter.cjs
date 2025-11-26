// utils/reportLimiter.cjs

const lastReports = new Map();

/**
 * Example: "2025-11-26-14"
 */
function getHourBlock(date = new Date()) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  return `${y}-${m}-${d}-${h}`;
}

/**
 * Check whether a Pokémon has already been reported this hour.
 *
 * Returns:
 *   { allowed: true }
 *   OR
 *   { allowed: false, nextResetUnix, nextResetLabel }
 */
function checkReportAllowed(pokemonName, reportTime = new Date()) {
  const key = (pokemonName || '').toLowerCase();
  const block = getHourBlock(reportTime);

  const lastBlock = lastReports.get(key);

  if (lastBlock && lastBlock === block) {
    const reset = new Date(reportTime);
    reset.setMinutes(60, 0, 0); // next :00
    const nextResetUnix = Math.floor(reset.getTime() / 1000);

    return {
      allowed: false,
      nextResetUnix,
      nextResetLabel: `<t:${nextResetUnix}:R>`
    };
  }

  lastReports.set(key, block);
  return { allowed: true };
}

module.exports = {
  checkReportAllowed,
  getHourBlock,
  lastReports
};

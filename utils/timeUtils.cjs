// utils/timeUtils.cjs

/**
 * Clamp duration hours to between 1 and 72.
 */
function clampHours(h) {
  if (!h || isNaN(h)) return 6;
  let hh = parseInt(h);
  if (hh < 1) hh = 1;
  if (hh > 72) hh = 72;
  return hh;
}

/**
 * Takes "HH:MM" (e.g. "14:00") and returns the hour number 0–23.
 */
function parseHourFromStartTimeString(str) {
  if (!str || typeof str !== 'string') return 0;
  if (str === 'now') return 0;

  const parts = str.split(':');
  const hour = parseInt(parts[0], 10);

  if (isNaN(hour) || hour < 0 || hour > 23) return 0;
  return hour;
}

/**
 * Returns a Date for the next occurrence of a given hour.
 */
function getNextOccurrenceOfHour(hour) {
  const now = new Date();
  const start = new Date(now);

  start.setMinutes(0, 0, 0);
  start.setHours(hour);

  // If today’s time already passed, schedule tomorrow
  if (start <= now) {
    start.setDate(start.getDate() + 1);
  }

  return start;
}

module.exports = {
  clampHours,
  parseHourFromStartTimeString,
  getNextOccurrenceOfHour
};


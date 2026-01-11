/**
 * utils/reportDispatcher.cjs
 *
 * Central dispatcher for Vortex roamers.
 */

const { handleVortexRoamer } = require('./vortexRoamerHandler.cjs');

async function dispatchVortexRoamer(client, roamer) {
  if (!client) {
    console.warn('⚠ Dispatcher called without client');
    return;
  }

  if (!roamer || !roamer.roamer_name) {
    console.warn('⚠ Invalid roamer payload (missing name):', roamer);
    return;
  }

  // ──────────────────────────────
  // NORMALISE TIMESTAMP (CRITICAL)
  // ──────────────────────────────
  let time_found =
    typeof roamer._timeFoundMs === 'number'
      ? roamer._timeFoundMs
      : roamer.time_found;

  if (typeof time_found === 'string') {
    const parsed = Date.parse(time_found.replace(' ', 'T'));
    if (!Number.isNaN(parsed)) {
      time_found = parsed;
    }
  }

  if (!time_found || typeof time_found !== 'number') {
    console.warn(
      '⚠ Invalid roamer payload (no usable timestamp):',
      roamer
    );
    return;
  }

  // Attach canonical timestamp for downstream consumers
  roamer._timeFoundMs = time_found;

  // ──────────────────────────────
  // HAND OFF TO HANDLER
  // ──────────────────────────────
  return handleVortexRoamer(client, roamer);
}

module.exports = {
  dispatchVortexRoamer
};
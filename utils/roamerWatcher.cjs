
/**
 * utils/roamerWatcher.cjs
 *
 * Polls Pokémon Vortex roamer feed and forwards
 * valid roamers into the Vortex report pipeline.
 */

const { fetchRoamers } = require('./vortexApi.cjs');
const { dispatchVortexRoamer } = require('./reportDispatchAdapter.cjs');

const INTERVAL = Number(process.env.VORTEX_API_INTERVAL || 60000);

// In-memory dedup (authoritative DB dedup happens later)
const seen = new Set();

async function pollRoamers(client) {
  if (process.env.VORTEX_API_ENABLED !== 'true') return;
  if (!client) return;

  try {
    const roamers = await fetchRoamers();

    if (!Array.isArray(roamers)) {
      console.warn('⚠ Vortex API returned invalid payload:', roamers);
      return;
    }

    for (const roamer of roamers) {
      if (!roamer || !roamer.roamer_name || !roamer.time_found) {
        console.warn(
          '⚠ Invalid roamer payload (missing fields):',
          roamer
        );
        continue;
      }

      // ──────────────────────────────
      // NORMALISE time_found
      // Vortex provides: "YYYY-MM-DD HH:mm:ss"
      // ──────────────────────────────
      let timeFoundMs = roamer.time_found;

      if (typeof timeFoundMs === 'string') {
        const parsed = Date.parse(
          timeFoundMs.replace(' ', 'T')
        );

        if (Number.isNaN(parsed)) {
          console.warn(
            '⚠ Invalid time_found format:',
            roamer.time_found
          );
          continue;
        }

        timeFoundMs = parsed;
      }

      // Attach canonical timestamp (do not break downstream logic)
      roamer._timeFoundMs = timeFoundMs;

      // ──────────────────────────────
      // IN-MEMORY DEDUP (FAST)
      // ──────────────────────────────
      const key = `${roamer.roamer_name}|${timeFoundMs}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // ──────────────────────────────
      // DISPATCH RAW VORTEX ROAMER
      // ──────────────────────────────
      dispatchVortexRoamer(client, roamer);
    }
  } catch (err) {
    console.error(
      '❌ Vortex roamer watcher:',
      err.message || err
    );
  }
}

function startRoamerWatcher(client) {
  if (process.env.VORTEX_API_ENABLED !== 'true') {
    console.log('⏸️ Vortex roamer watcher disabled');
    return;
  }

  console.log('🛰️ Vortex roamer watcher started');

  // Initial poll
  pollRoamers(client);

  // Interval polling
  setInterval(() => {
    pollRoamers(client);
  }, INTERVAL);
}

module.exports = {
  startRoamerWatcher
};
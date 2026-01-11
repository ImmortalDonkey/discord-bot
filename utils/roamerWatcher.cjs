/**
 * utils/roamerWatcher.cjs
 *
 * Polls the Pokémon Vortex roamer feed and dispatches
 * new roamers into the report pipeline.
 */

const { fetchRoamers } = require('./vortexApi.cjs');
const { dispatchReport } = require('./reportDispatchAdapter.cjs');

const INTERVAL = Number(process.env.VORTEX_API_INTERVAL || 60000);

// In-memory de-duplication (roamer_name + time_found)
const seen = new Set();

async function pollRoamers(client) {
  if (process.env.VORTEX_API_ENABLED !== 'true') return;
  if (!client) return;

  try {
    const roamers = await fetchRoamers();

    if (!Array.isArray(roamers)) {
      console.warn('⚠ Vortex roamer feed returned invalid payload');
      return;
    }

    for (const roamer of roamers) {
      if (!roamer || !roamer.roamer_name || !roamer.time_found) {
        console.warn('⚠ Skipping invalid roamer payload:', roamer);
        continue;
      }

      const key = `${roamer.roamer_name}|${roamer.time_found}`;
      if (seen.has(key)) continue;

      seen.add(key);

      // 🔑 CRITICAL: pass the roamer object directly
      dispatchReport(client, roamer);
    }
  } catch (err) {
    console.error('❌  Vortex roamer watcher:', err.message || err);
  }
}

function startRoamerWatcher(client) {
  if (process.env.VORTEX_API_ENABLED !== 'true') {
    console.log('⏸️ Vortex roamer watcher disabled');
    return;
  }

  console.log('🛰️ Vortex roamer watcher started');

  // Initial run
  pollRoamers(client);

  // Interval polling
  setInterval(() => {
    pollRoamers(client);
  }, INTERVAL);
}

module.exports = {
  startRoamerWatcher
};
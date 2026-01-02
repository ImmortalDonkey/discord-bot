// utils/roamerWatcher.cjs
const { fetchRoamers } = require('./vortexApi.cjs');
const { handleVortexRoamer } = require('./vortexRoamerHandler.cjs');

const INTERVAL = Number(process.env.VORTEX_API_INTERVAL || 60000);

// in-memory dedup (name + time_found)
const seen = new Set();

async function pollRoamers() {
  if (process.env.VORTEX_API_ENABLED !== 'true') return;

  try {
    const roamers = await fetchRoamers();

    for (const r of roamers) {
      const key = `${r.roamer_name}|${r.time_found}`;

      if (seen.has(key)) continue;
      seen.add(key);

      await handleVortexRoamer(r);
    }

    // memory hygiene (90 min buffer)
    if (seen.size > 500) {
      seen.clear();
    }

  } catch (err) {
    console.error('❌ Vortex roamer watcher:', err.message);
  }
}

function startRoamerWatcher() {
  setInterval(pollRoamers, INTERVAL);
}

module.exports = { startRoamerWatcher };

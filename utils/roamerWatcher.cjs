// utils/roamerWatcher.cjs

const { fetchRoamers } = require('./vortexApi.cjs');
const { handleVortexRoamer } = require('./vortexRoamerHandler.cjs');

const INTERVAL = Number(process.env.VORTEX_API_INTERVAL || 60000);

// in-memory dedup (name + time_found)
const seen = new Set();

let hasLoggedConfig = false;

async function pollRoamers() {
  // hard gate (dev + live safe)
  if (process.env.VORTEX_API_ENABLED !== 'true') return;

  // one-time visibility log (DEBUG / CONFIRMATION ONLY)
  if (!hasLoggedConfig) {
    console.log(
      '🛰️ Vortex watcher active | interval =',
      INTERVAL,
      '| env =',
      process.env.NODE_ENV || process.env.ENV || 'unknown'
    );
    hasLoggedConfig = true;
  }

  try {
    const roamers = await fetchRoamers();

    for (const r of roamers) {
      const key = `${r.roamer_name}|${r.time_found}`;

      if (seen.has(key)) continue;
      seen.add(key);

      await handleVortexRoamer(r);
    }

    // memory hygiene (roughly ~90 min buffer worst case)
    if (seen.size > 500) {
      seen.clear();
    }

  } catch (err) {
    console.error('❌ Vortex roamer watcher:', err.message);
  }
}

function startRoamerWatcher() {
  // immediate first run (don’t wait a full minute)
  pollRoamers().catch(() => {});

  // steady interval
  setInterval(pollRoamers, INTERVAL);
}

module.exports = { startRoamerWatcher };

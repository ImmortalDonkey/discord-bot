// utils/roamerWatcher.cjs

const { fetchRoamers } = require('./vortexApi.cjs');
const { handleVortexRoamer } = require('./vortexRoamerHandler.cjs');

const INTERVAL = Number(process.env.VORTEX_API_INTERVAL || 60000);

// in-memory dedup (name + time_found)
const seen = new Set();

async function pollRoamers(client) {
  if (process.env.VORTEX_API_ENABLED !== 'true') return;
  if (!client) return;

  try {
    const roamers = await fetchRoamers();

    for (const r of roamers) {
      const key = `${r.roamer_name}|${r.time_found}`;

      if (seen.has(key)) continue;
      seen.add(key);

      // ✅ PASS CLIENT DOWN (CRITICAL FIX)
      await handleVortexRoamer(client, r);
    }

    // memory hygiene
    if (seen.size > 500) {
      seen.clear();
    }

  } catch (err) {
    console.error('❌ Vortex roamer watcher:', err.message);
  }
}

function startRoamerWatcher(client) {
  if (!client) return;

  console.log(
    `🛰️ Vortex watcher active | interval = ${INTERVAL} | env = ${process.env.NODE_ENV || process.env.ENV}`
  );

  // run immediately once
  pollRoamers(client).catch(() => {});

  // then on interval
  setInterval(() => {
    pollRoamers(client).catch(() => {});
  }, INTERVAL);
}

module.exports = { startRoamerWatcher };

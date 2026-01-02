// utils/roamerWatcher.cjs

const { fetchRoamers } = require("./vortexApi.cjs");
const { handleVortexRoamer } = require("./vortexRoamerHandler.cjs");

const INTERVAL = Number(process.env.VORTEX_API_INTERVAL || 60000);

// in-memory dedup (name + time_found)
const seen = new Set();

async function pollRoamers(client) {
  if (process.env.VORTEX_API_ENABLED !== "true") return;

  try {
    const roamers = await fetchRoamers();

    for (const r of roamers) {
      const key = `${r.roamer_name}|${r.time_found}`;
      if (seen.has(key)) continue;

      seen.add(key);
      await handleVortexRoamer(client, r);
    }

    // memory hygiene
    if (seen.size > 500) {
      seen.clear();
    }
  } catch (err) {
    console.error("❌ Vortex roamer watcher:", err.message);
  }
}

function startRoamerWatcher(client) {
  console.log(
    `🛰️ Vortex watcher active | interval = ${INTERVAL} | env = ${process.env.ENV || process.env.NODE_ENV}`
  );

  setInterval(() => pollRoamers(client), INTERVAL);
}

module.exports = { startRoamerWatcher };

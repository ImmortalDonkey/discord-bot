// utils/vortexRoamerHandler.cjs
const db = require("../database.cjs");

/**
 * Handles a single roamer entry from the Vortex API.
 * For now: log + DB dedup only (no posting).
 */
async function handleVortexRoamer(roamer) {
  const { roamer_name, time_found, location } = roamer;

  // DB-level dedup (authoritative)
  const exists = await db.hasVortexRoamer(roamer_name, time_found);
  if (exists) return;

  await db.insertVortexRoamer(roamer_name, time_found);

  console.log(
    `🛰️ New roamer detected: ${roamer_name} @ ${location} (${time_found})`
  );

  // ⛔ DO NOT post reports yet
  // ⛔ DO NOT award points yet
}

module.exports = {
  handleVortexRoamer
};

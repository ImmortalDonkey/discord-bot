// utils/vortexApi.cjs
// ------------------------------------------------------
// Pokémon Vortex – Roamer API client
// - Uses official API key (per Patrick approval)
// - ONE call per interval (default 60s)
// - CommonJS-safe fetch handling (Node 18+)
// ------------------------------------------------------

const API_KEY = process.env.VORTEX_API_KEY;
const API_URL = `https://api.pokemon-vortex.com/get/roamers/all/?key=${API_KEY}`;

if (!API_KEY) {
  console.warn("⚠ VORTEX_API_KEY missing — roamer watcher will not function.");
}

// Ensure fetch exists (Node 18+)
const fetchFn = globalThis.fetch;
if (typeof fetchFn !== "function") {
  throw new Error(
    "Global fetch is not available. Node 18+ required for Vortex API."
  );
}

/**
 * Fetch current roaming Pokémon from Vortex API
 * Returns: Array<{ roamer_name, time_found, location, found_by_* }>
 */
async function fetchRoamers() {
  if (!API_KEY) return [];

  const res = await fetchFn(API_URL, {
    method: "GET",
    headers: {
      "User-Agent": "Roaming-Companion (Discord Bot)",
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`Vortex API HTTP ${res.status}`);
  }

  const data = await res.json();

  if (!Array.isArray(data)) {
    throw new Error("Unexpected Vortex API response format");
  }

  return data;
}

module.exports = {
  fetchRoamers
};

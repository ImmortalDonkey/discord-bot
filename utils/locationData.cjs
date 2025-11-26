// utils/locationData.cjs

/**
 * In-memory location tracking for the roaming system.
 * These maps are imported and mutated directly by the command handlers.
 */

// Track user → { location, timestamp, username }
const playerLocations = new Map();

// Track pending reports (user → { pokemon, route })
const pendingReports = new Map();

// All valid roaming locations
const availableLocations = [
  "Route 1", "Route 2", "Route 3", "Route 4", "Route 6", "Route 7",
  "Route 8", "Route 9", "Route 10", "Route 11", "Route 12", "Route 13",
  "Route 14", "Route 15", "Route 16", "Route 17", "Route 18", "Route 19",
  "Route 20", "Route 21", "Route 22", "Route 23", "Route 24", "Route 25",
  "Mudbray Ranch", "New Haven", "Nightshade", "Shore's End",
  "Stillwater Quarry", "Wild Overgrowth"
];

module.exports = {
  playerLocations,
  pendingReports,
  availableLocations
};


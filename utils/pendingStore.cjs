// utils/pendingStore.cjs

// Location system
const playerLocations = new Map();

// Report system
const pendingReports = new Map();

// Bounty system
const pendingBounties = new Map(); // bountyId -> bountyObject
const activeBounties = new Map();  // bountyId -> bountyObject
const bountyClaims = new Map();    // claimId  -> claimObject

// Available locations (shared globally)
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
  pendingBounties,
  activeBounties,
  bountyClaims,
  availableLocations
};


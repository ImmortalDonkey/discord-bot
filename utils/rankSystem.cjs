// utils/rankSystem.cjs

// Rank tiers based on lifetime points
const RANKS = [
  { name: 'Rookie Trainer', min: 0 },
  { name: 'Trainer', min: 50 },
  { name: 'Ace Trainer', min: 250 },
  { name: 'Gym Challenger', min: 600 },
  { name: 'Gym Leader', min: 2000 },
  { name: 'Elite Four', min: 3000 },
  { name: 'Champion', min: 5000 },
  { name: 'Master', min: 10000 }
];

/**
 * Get rank name based on lifetime points.
 */
function getRankName(lifetime) {
  let rank = RANKS[0].name;
  for (const r of RANKS) {
    if (lifetime >= r.min) rank = r.name;
  }
  return rank;
}

module.exports = {
  RANKS,
  getRankName
};


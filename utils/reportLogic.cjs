// utils/reportLogic.cjs

const { getRarity } = require('./rarity.cjs');
const { awardPoints } = require('./points.cjs');
const { getRankName } = require('./rankSystem.cjs');

// In-memory history of THIS HOUR’S reports
// Key: pokemonName.toLowerCase()
// Value: array of report objects { userId, pokemon, createdAt, ... }
const reportHistory = new Map();

/**
 * Clean out previous hour's reports.
 * Should run before any duplicate checking.
 */
function cleanupOldReports() {
  const now = new Date();
  const currentHour = now.getHours();

  for (const [pokemon, reports] of reportHistory) {
    const filtered = reports.filter(r => {
      const t = r.createdAt;
      return (
        t.getHours() === currentHour &&
        t.getDate() === now.getDate() &&
        t.getMonth() === now.getMonth() &&
        t.getFullYear() === now.getFullYear()
      );
    });

    if (filtered.length === 0) {
      reportHistory.delete(pokemon);
    } else {
      reportHistory.set(pokemon, filtered);
    }
  }
}

/**
 * Build a report object (pure logic).
 */
function buildReport({
  userId,
  username,
  nickname,
  pokemon,
  route
}) {
  const rarity = getRarity(pokemon);

  const now = new Date();
  const expiry = new Date(now);
  expiry.setMinutes(59, 59, 999);

  const expiryLabel = expiry.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  const report = {
    id: `${Date.now()}_${userId}`,
    userId,
    username,
    nickname,
    pokemon,
    route,
    rarity,
    pointsAwarded: 0,
    createdAt: now,
    expiry,
    expiryLabel
  };

  return report;
}

/**
 * Award base points & return lifetime + rank.
 */
async function processReportPoints(userId, username, rarity) {
  const rarityPoints = {
    roamerMonth: 30,
    paradox: 200,
    legendary: 20,
    rare: 20,
    common: 1
  };

  const pts = rarityPoints[rarity] || 1;

  const updatedRow = await awardPoints(
    userId,
    username,
    pts,
    `Report`
  );

  const lifetime = updatedRow?.lifetime_points || 0;
  const rankName = getRankName(lifetime);

  return {
    pointsAwarded: pts,
    lifetime,
    rankName
  };
}

/**
 * Check if this Pokémon was reported already this hour.
 */
function isDuplicateReport(pokemon) {
  cleanupOldReports();

  const key = pokemon.toLowerCase();
  const history = reportHistory.get(key);
  return history && history.length > 0;
}

/**
 * Store report in hourly log.
 */
function storeReport(report) {
  const key = report.pokemon.toLowerCase();
  if (!reportHistory.has(key)) {
    reportHistory.set(key, []);
  }
  reportHistory.get(key).push(report);
}

module.exports = {
  // main logic functions
  buildReport,
  processReportPoints,
  isDuplicateReport,
  storeReport,

  // exposed for scheduled cleanup (optional)
  cleanupOldReports,
  
  // exposed for debugging or analytics
  reportHistory
};

// utils/reportLogic.cjs

const { getRarity } = require('./rarity.cjs');
const { awardPoints } = require('./points.cjs');
const { getRankName } = require('./rankSystem.cjs');

/**
 * Build a report object (pure logic).
 * Does NOT send Discord messages or files.
 */
function buildReport({
  userId,
  username,
  nickname,
  pokemon,
  route
}) {
  const rarity = getRarity(pokemon);

  // Calculate expiry: always end-of-hour
  const now = new Date();
  const expiry = new Date(now);
  expiry.setMinutes(59, 59, 999);

  // Format "Available until: 12:00"
  const expiryLabel = expiry.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return {
    id: `${Date.now()}_${userId}`,
    userId,
    username,
    nickname,
    pokemon,
    route,
    rarity,
    pointsAwarded: 0,  // set AFTER awarding
    expiry,
    expiryLabel,
    createdAt: now
  };
}

/**
 * Award points + fetch lifetime + rank
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
 * Detect duplicate reports within the same hour
 */
function isDuplicateReport(existingReports, pokemon) {
  const now = new Date();

  // same pokemon reported this hour?
  return existingReports.some(r => {
    const sameName = r.pokemon.toLowerCase() === pokemon.toLowerCase();

    // same hour?
    const sameHour =
      r.createdAt.getHours() === now.getHours() &&
      r.createdAt.getDate() === now.getDate() &&
      r.createdAt.getMonth() === now.getMonth() &&
      r.createdAt.getFullYear() === now.getFullYear();

    return sameName && sameHour;
  });
}

module.exports = {
  buildReport,
  processReportPoints,
  isDuplicateReport
};

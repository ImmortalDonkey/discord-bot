// utils/points.cjs

const db = require('../database.cjs');
const { getRankName } = require('./rankSystem.cjs');
const { getRarity, getRarityDisplayLabel, rarityPoints } = require('./rarity.cjs');

/**
 * Award points to a player.
 * - Updates BOTH lifetime_points AND points (spendable)
 * - Returns updated row
 */
async function awardPoints(userId, username, amount, reason = "") {
  return await db.addPoints(userId, username, amount, reason);
}

/**
 * Returns:
 * - rarity key (paradox, legendary, rare, common)
 * - readable label ("Paradox", "Legendary", etc)
 * - points awarded
 */
function getPokemonPointInfo(pokemonName) {
  const rarityKey = getRarity(pokemonName);
  return {
    rarityKey,
    rarityLabel: getRarityDisplayLabel(rarityKey),
    points: rarityPoints[rarityKey] || 1
  };
}

/**
 * Format user rank + points for /mypoints
 */
function formatRankInfo(dbRow) {
  const lifetime = dbRow?.lifetime_points || 0;
  const current = dbRow?.points || 0;

  return {
    lifetime,
    current,
    rankName: getRankName(lifetime),
    pkdValue: current * 200000
  };
}

module.exports = {
  awardPoints,
  getPokemonPointInfo,
  formatRankInfo
};


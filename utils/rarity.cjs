// utils/rarity.cjs

// Rarity groups (from your working index.cjs)
const rarityGroups = {
  roamerMonth: [
    "Clone Venusaur", "Clone Charizard", "Clone Blastoise",
    "Ancient Jigglypuff", "Ancient Alakazam", "Ancient Gengar",
    "Crystal Onix", "Pink Rhyhorn", "Snorlax (Snowman)",
    "Mewtwo (Shadow)", "Golden Sudowoodo", "XD001", "Reddy",
    "Meta Groudon", "Rayquaza (Illusion)", "Dialga (Primal)", "Z2"
  ],
  paradox: [
    "Walking Wake", "Gouging Fire", "Raging Bolt",
    "Iron Leaves", "Iron Boulder", "Iron Crown"
  ],
  legendary: [
    "Raikou", "Entei", "Suicune",
    "Latias", "Latios",
    "Glastrier", "Spectrier",
    "Koraidon", "Miraidon"
  ],
  rare: ["Cyclizar", "Gimmighoul (Roaming)"],
  common: ["Zygarde (Cell)", "Bramblin", "Bombirdier", "Varoom"]
};

// Rarity priority (highest -> lowest)
const rarityPriority = ['paradox', 'roamerMonth', 'legendary', 'rare', 'common'];

// Base points per rarity (full value before diminishing)
const rarityPoints = {
  roamerMonth: 30,
  paradox: 200,
  legendary: 20,
  rare: 20,
  common: 1
};

// Determine rarity key from a Pokémon name
function getRarity(pokemon) {
  const name = (pokemon || '').toLowerCase();
  for (const key of rarityPriority) {
    const list = rarityGroups[key] || [];
    if (list.some(p => p.toLowerCase() === name)) return key;
  }
  return 'common';
}

/**
 * Given a list of Pokémon names, return the *highest* rarity according
 * to the configured priority.
 */
function getHighestRarityForList(pokemonNames = []) {
  if (!pokemonNames.length) return 'common';
  let best = 'common';
  for (const name of pokemonNames) {
    const r = getRarity(name);
    if (rarityPriority.indexOf(r) < rarityPriority.indexOf(best)) {
      best = r;
    }
  }
  return best;
}

// Nice display label for rarity keys
function getRarityDisplayLabel(key) {
  if (key === 'paradox') return 'Paradox';
  if (key === 'roamerMonth') return 'Roamer of the Month';
  if (key === 'legendary' || key === 'rare') return 'Legendary / Rare';
  return 'Common';
}

module.exports = {
  rarityGroups,
  rarityPriority,
  rarityPoints,
  getRarity,
  getHighestRarityForList,
  getRarityDisplayLabel
};

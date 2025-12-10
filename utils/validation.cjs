// utils/validation.cjs
// Central source of truth for:
// - valid Pokémon names (for roaming reports / bounties)
// - valid locations (routes / special areas)

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

// flat list of all reportable Pokémon
const allPokemon = Object.values(rarityGroups).flat();

// locations that have backgrounds / are allowed in /report
const availableLocations = [
  "Route 1","Route 2","Route 3","Route 4","Route 6","Route 7",
  "Route 8","Route 9","Route 10","Route 11","Route 12","Route 13",
  "Route 14","Route 15","Route 16","Route 17","Route 18","Route 19",
  "Route 20","Route 21","Route 22","Route 23","Route 24","Route 25",
  "Mudbray Ranch","New Haven","Nightshade",
  "Shore's End","Stillwater Quarry","Wild Overgrowth"
];

function normalise(str) {
  return String(str || "").trim().toLowerCase();
}

function isValidPokemon(name) {
  if (!name) return false;
  const target = normalise(name);
  return allPokemon.some(p => normalise(p) === target);
}

function isValidLocation(location) {
  if (!location) return false;
  const target = normalise(location);
  return availableLocations.some(l => normalise(l) === target);
}

module.exports = {
  // validation helpers
  isValidPokemon,
  isValidLocation,

  // exported lists so other files (autocomplete, scoring, etc.) can reuse them
  rarityGroups,
  allPokemon,
  availableLocations
};
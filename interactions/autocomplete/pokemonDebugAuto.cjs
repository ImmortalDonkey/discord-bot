// interactions/autocomplete/pokemonDebugAuto.cjs

// Same rarity group list used by your main autocomplete.
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

const allPokemon = Object.values(rarityGroups).flat();

module.exports = [
  {
    commandName: "reportdebug",
    optionName: "pokemon",

    async execute(interaction) {
      const focused = interaction.options.getFocused() || "";

      const filtered = allPokemon
        .filter(p => p.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25);

      return interaction.respond(
        filtered.map(p => ({ name: p, value: p }))
      );
    }
  }
];

// interactions/autocomplete/pokemonAuto.cjs

// Your existing rarity groups:
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

module.exports = {
  commandName: "report",                // applies to /report
  commandName2: "bountyrequest",        // ALSO applies to /bountyrequest
  options: ["pokemon", "pokemon1", "pokemon2", "pokemon3"],

  async execute(client, interaction) {
    const focused = interaction.options.getFocused() || "";

    const filtered = allPokemon
      .filter(x => x.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25);

    return interaction.respond(
      filtered.map(p => ({ name: p, value: p }))
    );
  }
};

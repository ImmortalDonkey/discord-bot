// interactions/autocomplete/pokemonAuto.cjs

const {
  rarityGroups,
  allPokemon
} = require("../../utils/validation.cjs");

module.exports = [
  // /report pokemon:<string>
  {
    commandName: "report",
    optionName: "pokemon",

    async execute(interaction) {
      const focused = interaction.options.getFocused() || "";

      const filtered = allPokemon
        .filter(x => x.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25);

      return interaction.respond(
        filtered.map(p => ({ name: p, value: p }))
      );
    }
  },

  // /bountyrequest pokemon1
  {
    commandName: "bountyrequest",
    optionName: "pokemon1",

    async execute(interaction) {
      const focused = interaction.options.getFocused() || "";

      const filtered = allPokemon
        .filter(x => x.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25);

      return interaction.respond(
        filtered.map(p => ({ name: p, value: p }))
      );
    }
  },

  // /bountyrequest pokemon2
  {
    commandName: "bountyrequest",
    optionName: "pokemon2",

    async execute(interaction) {
      const focused = interaction.options.getFocused() || "";

      const filtered = allPokemon
        .filter(x => x.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25);

      return interaction.respond(
        filtered.map(p => ({ name: p, value: p }))
      );
    }
  },

  // /bountyrequest pokemon3
  {
    commandName: "bountyrequest",
    optionName: "pokemon3",

    async execute(interaction) {
      const focused = interaction.options.getFocused() || "";

      const filtered = allPokemon
        .filter(x => x.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25);

      return interaction.respond(
        filtered.map(p => ({ name: p, value: p }))
      );
    }
  }
];
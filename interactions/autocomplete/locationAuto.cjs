// interactions/autocomplete/locationAuto.cjs

const { availableLocations } = require("../../utils/validation.cjs");

function filterLocations(interaction) {
  const focused = interaction.options.getFocused() || "";

  return availableLocations
    .filter(loc => loc.toLowerCase().includes(focused.toLowerCase()))
    .slice(0, 25)
    .map(l => ({ name: l, value: l }));
}

module.exports = [
  // /report route:<string>
  {
    commandName: "report",
    optionName: "route",

    async execute(interaction) {
      return interaction.respond(filterLocations(interaction));
    }
  },

  // /setlocation location:<string>
  {
    commandName: "setlocation",
    optionName: "location",

    async execute(interaction) {
      return interaction.respond(filterLocations(interaction));
    }
  }
];
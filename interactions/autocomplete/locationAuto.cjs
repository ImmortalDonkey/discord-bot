// interactions/autocomplete/locationAuto.cjs

const availableLocations = [
  "Route 1","Route 2","Route 3","Route 4","Route 6","Route 7",
  "Route 8","Route 9","Route 10","Route 11","Route 12","Route 13",
  "Route 14","Route 15","Route 16","Route 17","Route 18","Route 19",
  "Route 20","Route 21","Route 22","Route 23","Route 24","Route 25",
  "Mudbray Ranch","New Haven","Nightshade",
  "Shore's End","Stillwater Quarry","Wild Overgrowth"
];

module.exports = {
  // BOTH commands that use location autocomplete
  commandName: "report",
  commandName2: "setlocation",

  // BOTH option names used for location
  options: ["route", "location"],

  async execute(client, interaction) {
    const focused = interaction.options.getFocused() || "";

    const filtered = availableLocations
      .filter(loc => loc.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25);

    return interaction.respond(
      filtered.map(l => ({ name: l, value: l }))
    );
  }
};

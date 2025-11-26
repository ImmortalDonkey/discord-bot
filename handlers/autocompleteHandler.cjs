// handlers/autocompleteHandler.cjs
//
// Handles ALL autocomplete interactions:
// - Pokémon names (from rarity groups)
// - Location names
// - Bounty Pokémon selectors
//

const { rarityGroups } = require('../utils/rarity.cjs');
const { availableLocations } = require('../utils/locationData.cjs');

module.exports = (client) => {
  client.on('interactionCreate', async interaction => {
    if (!interaction.isAutocomplete()) return;

    const focused = interaction.options.getFocused();
    const option = interaction.options.getFocused(true).name;
    let choices = [];

    // ==========================
    // REPORT COMMAND
    // ==========================
    if (interaction.commandName === "report") {
      if (option === "pokemon") {
        choices = Object.values(rarityGroups).flat();
      } else if (option === "route") {
        choices = availableLocations;
      }
    }

    // ==========================
    // SETLOCATION COMMAND
    // ==========================
    if (interaction.commandName === "setlocation") {
      choices = availableLocations;
    }

    // ==========================
    // BOUNTYREQUEST COMMAND
    // ==========================
    if (interaction.commandName === "bountyrequest") {
      if (option === "pokemon1" || option === "pokemon2" || option === "pokemon3") {
        choices = Object.values(rarityGroups).flat();
      }
    }

    // ==========================
    // FILTER + LIMIT TO 25
    // ==========================
    const filtered = choices
      .filter(c => c.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25);

    return interaction.respond(filtered.map(c => ({ name: c, value: c })));
  });
};


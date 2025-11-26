// handlers/autocomplete/reportAutocomplete.cjs
const { rarityGroups } = require('../utils/rarity.cjs');
const { availableLocations } = require('../utils/locations.cjs');

module.exports = async function handleReportAutocomplete(interaction) {
  const focused = interaction.options.getFocused();
  const focusedOption = interaction.options.getFocused(true);
  const optionName = focusedOption.name;

  let choices = [];

  if (optionName === 'pokemon') {
    choices = Object.values(rarityGroups).flat();
  } else if (optionName === 'route') {
    choices = availableLocations;
  }

  const filtered = choices
    .filter(c => c.toLowerCase().includes(focused.toLowerCase()))
    .slice(0, 25);

  return interaction.respond(
    filtered.map(c => ({ name: c, value: c }))
  );
};

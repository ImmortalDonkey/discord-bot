const {
  CARD_OUTLINE_PRESETS
} = require('../../utils/reportCardPresets.cjs');

module.exports = {
  commandName: 'reportconfig',
  optionName: 'colour',

  async execute(interaction) {
    const focused = interaction.options.getFocused(true);
    const value = String(focused.value || '').toLowerCase();

    // Match presets by prefix
    const matches = Object.keys(CARD_OUTLINE_PRESETS)
      .filter(key => key.startsWith(value))
      .slice(0, 25); // Discord hard limit

    // Always respond (even if empty)
    await interaction.respond(
      matches.map(key => ({
        name: key,
        value: key
      }))
    );
  }
};
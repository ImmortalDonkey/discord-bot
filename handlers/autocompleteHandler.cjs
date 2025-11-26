// handlers/autocompleteHandler.cjs
const fs = require('fs');
const path = require('path');

let modules = [];

const autoDir = path.join(__dirname, '..', 'interactions', 'autocomplete');

if (fs.existsSync(autoDir)) {
  const files = fs.readdirSync(autoDir).filter(f => f.endsWith('.cjs'));

  for (const f of files) {
    const mod = require(path.join(autoDir, f));

    if (mod && Array.isArray(mod.commands) && typeof mod.run === 'function') {
      modules.push(mod);
      console.log(`✅ Loaded autocomplete module: ${f}`);
    } else {
      console.log(`⚠ Skipped autocomplete file: ${f}`);
    }
  }
} else {
  console.warn(`⚠ Autocomplete folder missing: ${autoDir}`);
}

module.exports = async function handleAutocomplete(interaction) {
  const cmd = interaction.commandName;
  const focusedName = interaction.options.getFocused(true).name;

  for (const mod of modules) {
    if (mod.commands.includes(cmd) && mod.options.includes(focusedName)) {
      try {
        return await mod.run(interaction);
      } catch (err) {
        console.error(`❌ Error in autocomplete module (${cmd}/${focusedName}):`, err);
        return interaction.respond([]);
      }
    }
  }

  return interaction.respond([]);
};

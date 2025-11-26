// handlers/autocompleteHandler.cjs
const path = require('path');
const fs = require('fs');

const autoModules = [];

// NOTE: matches your structure: interactions/autocomplete/*.cjs
const autoDir = path.join(__dirname, '..', 'interactions', 'autocomplete');

if (fs.existsSync(autoDir)) {
  const files = fs.readdirSync(autoDir).filter(f => f.endsWith('.cjs'));

  for (const file of files) {
    const mod = require(path.join(autoDir, file));

    // each module should export: { commandName, execute(client, interaction) }
    if (mod && mod.commandName && typeof mod.execute === 'function') {
      autoModules.push(mod);
      console.log(`✅ Loaded autocomplete module for /${mod.commandName} (${file})`);
    } else {
      console.warn(`⚠ Skipping autocomplete file "${file}" – missing commandName/execute.`);
    }
  }
} else {
  console.warn('⚠ No autocomplete directory found at', autoDir);
}

module.exports = async (client, interaction) => {
  const name = interaction.commandName;
  const mod = autoModules.find(m => m.commandName === name);
  if (!mod) return;

  try {
    await mod.execute(client, interaction);
  } catch (err) {
    console.error(`❌ Autocomplete error for "/${name}":`, err);
  }
};
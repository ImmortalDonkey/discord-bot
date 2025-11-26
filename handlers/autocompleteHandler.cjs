// handlers/autoComplete.cjs
const path = require('path');
const fs = require('fs');

const autoModules = [];

const autoDir = path.join(__dirname, '..', 'autoComplete');
if (fs.existsSync(autoDir)) {
  const files = fs.readdirSync(autoDir).filter(f => f.endsWith('.cjs'));

  for (const file of files) {
    const m = require(path.join(autoDir, file));

    if (m && m.commandName && m.execute) {
      autoModules.push(m);
    } else {
      console.warn(`⚠ Invalid autocomplete module: ${file}`);
    }
  }
}

module.exports = async (client, interaction) => {
  const name = interaction.commandName;

  const mod = autoModules.find(m => m.commandName === name);
  if (!mod) return;

  try {
    await mod.execute(client, interaction);
  } catch (err) {
    console.error(`❌ Autocomplete Error (${name}):`, err);
  }
};

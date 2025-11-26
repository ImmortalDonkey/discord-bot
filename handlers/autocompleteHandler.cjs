// handlers/autocompleteHandler.cjs
const path = require("path");
const fs = require("fs");

const modules = [];

const autoDir = path.join(__dirname, "..", "interactions", "autocomplete");

if (fs.existsSync(autoDir)) {
  for (const file of fs.readdirSync(autoDir).filter(f => f.endsWith(".cjs"))) {
    const mod = require(path.join(autoDir, file));

    if (!mod.commandName || !mod.optionName || typeof mod.execute !== "function") {
      console.warn(`⚠ Invalid autocomplete module skipped: ${file}`);
      continue;
    }

    modules.push(mod);
    console.log(`✅ Loaded autocomplete module: ${file}`);
  }
}

module.exports = async (interaction) => {
  const cmd = interaction.commandName;
  const opt = interaction.options.getFocused(true).name;

  const mod = modules.find(m =>
    m.commandName === cmd &&
    m.optionName === opt
  );

  if (!mod) {
    console.warn(`❌ No autocomplete match: command = ${cmd} option = ${opt}`);
    return;
  }

  try {
    await mod.execute(interaction);
  } catch (err) {
    console.error(`❌ Autocomplete error in ${mod.commandName}/${mod.optionName}:`, err);
  }
};

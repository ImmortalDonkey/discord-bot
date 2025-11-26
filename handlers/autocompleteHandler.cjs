// handlers/autocompleteHandler.cjs
const fs = require("fs");
const path = require("path");

let autoModules = [];

const autoDir = path.join(__dirname, "..", "interactions", "autocomplete");

if (fs.existsSync(autoDir)) {
  const files = fs.readdirSync(autoDir).filter(f => f.endsWith(".cjs"));

  for (const file of files) {
    try {
      const mod = require(path.join(autoDir, file));

      // Must export: commandName + optionName + execute()
      if (
        !mod ||
        !mod.commandName ||
        !mod.optionName ||
        typeof mod.execute !== "function"
      ) {
        console.warn(`⚠ Invalid autocomplete file skipped: ${file}`);
        continue;
      }

      autoModules.push(mod);
      console.log(`🔎 Loaded autocomplete: ${mod.commandName}.${mod.optionName}`);
    } catch (err) {
      console.error(`❌ Failed to load ${file}:`, err);
    }
  }
}

module.exports = async function (interaction) {
  const command = interaction.commandName;
  const focused = interaction.options.getFocused(true); // { name, value }
  const option = focused.name;

  const handler = autoModules.find(
    m => m.commandName === command && m.optionName === option
  );

  if (!handler) return;

  try {
    await handler.execute(interaction);
  } catch (err) {
    console.error(`❌ Autocomplete error (${command}.${option}):`, err);
  }
};

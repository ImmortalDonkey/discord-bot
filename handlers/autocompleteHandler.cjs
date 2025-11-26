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

      const modules = Array.isArray(mod) ? mod : [mod];

      modules.forEach(m => {
        if (m.commandName && m.optionName && typeof m.execute === "function") {
          autoModules.push(m);
          console.log(`🔎 Loaded autocomplete: ${m.commandName}.${m.optionName}`);
        } else {
          console.warn(`⚠ Invalid autocomplete file skipped: ${file}`);
        }
      });

    } catch (err) {
      console.error(`❌ Failed to load ${file}:`, err);
    }
  }
}

module.exports = async function (interaction) {
  const command = interaction.commandName;
  const focused = interaction.options.getFocused(true);
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

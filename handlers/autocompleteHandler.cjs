// handlers/autocompleteHandler.cjs
const fs = require("fs");
const path = require("path");

// Load all autocomplete modules
const handlers = [];
const folder = path.join(__dirname, "..", "interactions", "autocomplete");

for (const file of fs.readdirSync(folder)) {
  if (!file.endsWith(".cjs")) continue;

  const mod = require(path.join(folder, file));

  // Must export:  commands:[], options:[], run()
  if (
    mod &&
    Array.isArray(mod.commands) &&
    Array.isArray(mod.options) &&
    typeof mod.run === "function"
  ) {
    handlers.push(mod);
    console.log(`✅ Loaded autocomplete module: ${file}`);
  } else {
    console.warn(`⚠ Invalid autocomplete module skipped: ${file}`);
  }
}

module.exports = async function handleAutocomplete(interaction) {
  const command = interaction.commandName;
  const focused = interaction.options.getFocused(true); // includes name + value

  for (const h of handlers) {
    if (h.commands.includes(command) && h.options.includes(focused.name)) {
      return h.run(interaction);
    }
  }

  console.log(
    "❌ No autocomplete match:",
    "command =", command,
    "option =", focused.name
  );
};

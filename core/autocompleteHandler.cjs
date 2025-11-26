// core/autocompleteHandler.cjs
const fs = require("fs");
const path = require("path");

const autoDir = path.join(__dirname, "..", "interactions", "autocomplete");

const modules = [];

// Load all autocomplete modules
for (const file of fs.readdirSync(autoDir)) {
  if (!file.endsWith(".cjs")) continue;

  const mod = require(path.join(autoDir, file));

  /**
   * Each module must export:
   *   commands: [ "report", "setlocation", ... ]
   *   options: [ "pokemon", "route", ... ]
   *   run(interaction, client)
   */
  if (!mod.commands || !mod.options || !mod.run) {
    console.warn("⚠ Invalid autocomplete module:", file);
    continue;
  }

  modules.push(mod);
}

console.log(`📦 Loaded ${modules.length} autocomplete modules.`);

module.exports = {
  async handle(client, interaction) {
    if (!interaction.isAutocomplete()) return false;

    const command = interaction.commandName;
    const focusedOpt = interaction.options.getFocused(true).name;

    // Find module matching command + option
    const handler = modules.find(m =>
      m.commands.includes(command) &&
      m.options.includes(focusedOpt)
    );

    if (!handler) {
      console.warn(`⚠ No autocomplete handler for: ${command}.${focusedOpt}`);
      return false;
    }

    try {
      await handler.run(interaction, client);
    } catch (err) {
      console.error("❌ Autocomplete error:", err);
    }

    return true;
  }
};

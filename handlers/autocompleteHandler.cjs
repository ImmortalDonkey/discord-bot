// handlers/autocompleteHandler.cjs
const path = require("path");
const fs = require("fs");

let autoModules = [];

const autoDir = path.join(__dirname, "..", "interactions", "autocomplete");

if (fs.existsSync(autoDir)) {
  const files = fs.readdirSync(autoDir).filter(f => f.endsWith(".cjs"));

  for (const file of files) {
    const mod = require(path.join(autoDir, file));

    const valid =
      mod &&
      typeof mod.execute === "function" &&
      (mod.commandName || mod.commandName2);

    if (!valid) {
      console.warn(`⚠ Invalid autocomplete file skipped: ${file}`);
      continue;
    }

    autoModules.push(mod);
    console.log(`✅ Loaded autocomplete module: ${file}`);
  }
}

module.exports = async (client, interaction) => {
  const name = interaction.commandName;

  const handler = autoModules.find(mod =>
    mod.commandName === name || mod.commandName2 === name
  );

  if (!handler) return;

  try {
    await handler.execute(client, interaction);
  } catch (err) {
    console.error(`❌ Autocomplete error (${name}):`, err);
  }
};

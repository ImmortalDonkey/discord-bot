// core/modalHandler.cjs
const fs = require("fs");
const path = require("path");

// Load all modal modules from /interactions/modals/
const modalsDir = path.join(__dirname, "..", "interactions", "modals");

// Cache modal handlers
const modalModules = [];

// Dynamically load all modal files
for (const file of fs.readdirSync(modalsDir)) {
  if (!file.endsWith(".cjs")) continue;

  const fullPath = path.join(modalsDir, file);
  const moduleExports = require(fullPath);

  /**
   * Each modal must export:
   *  - idStartsWith: "bountyclaim_"
   *  - execute(client, interaction)
   */
  if (!moduleExports.idStartsWith || !moduleExports.execute) {
    console.warn(`⚠ Modal module missing required fields: ${file}`);
    continue;
  }

  modalModules.push(moduleExports);
}

console.log(`📦 Loaded ${modalModules.length} modal handlers.`);

module.exports = {
  /**
   * Dispatch modal interaction to the correct module.
   */
  async handle(client, interaction) {
    if (!interaction.isModalSubmit()) return false;

    const id = interaction.customId;

    // Find module with matching prefix
    const module = modalModules.find(m =>
      id.startsWith(m.idStartsWith)
    );

    if (!module) {
      console.warn(`⚠ No modal handler found for ID: ${id}`);
      return false;
    }

    try {
      await module.execute(client, interaction);
    } catch (err) {
      console.error("❌ Modal handler error:", err);
      try {
        await interaction.reply({
          content: "❌ Something went wrong while processing the modal.",
          ephemeral: true
        });
      } catch {}
    }

    return true;
  }
};

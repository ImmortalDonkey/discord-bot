// handlers/buttonHandler.cjs
const path = require('path');
const fs = require('fs');

const buttonHandlers = [];

/**
 * Load all button handlers from interactions/buttons.
 * Each module should export:
 *   - ids: array of strings (exact IDs or prefixes like "approvebounty_")
 *   - execute(client, interaction)
 */
function initButtonHandlers(client) {
  const buttonsDir = path.join(__dirname, '..', 'interactions', 'buttons');

  if (!fs.existsSync(buttonsDir)) {
    console.warn('⚠ No buttons directory found at', buttonsDir);
    return;
  }

  const files = fs.readdirSync(buttonsDir).filter(f => f.endsWith('.cjs'));

  for (const file of files) {
    const fullPath = path.join(buttonsDir, file);
    try {
      const mod = require(fullPath);
      if (!mod || !Array.isArray(mod.ids) || typeof mod.execute !== 'function') {
        console.warn(`⚠ Skipping button file "${file}" – missing ids[] or execute().`);
        continue;
      }

      buttonHandlers.push(mod);
      console.log(`✅ Loaded button handler from ${file}`);
    } catch (err) {
      console.error(`❌ Error loading button file "${file}":`, err);
    }
  }
}

/**
 * Route button presses to the correct module.
 * Supports:
 *   - exact match: id === customId
 *   - prefix match: id + "*" pattern (we treat any id ending with "_" as prefix)
 */
async function handleButtonInteraction(client, interaction) {
  const id = interaction.customId;

  // try exact match first, then prefix match
  const handler = buttonHandlers.find(mod =>
    mod.ids.some(btnId =>
      id === btnId || id.startsWith(btnId)
    )
  );

  if (!handler) {
    console.warn(`⚠ No button handler for "${id}".`);
    return;
  }

  try {
    await handler.execute(client, interaction);
  } catch (err) {
    console.error(`❌ Button handler error (${id}):`, err);

    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        content: '❌ Error while processing this button.',
        ephemeral: true
      }).catch(() => {});
    }
  }
}

module.exports = {
  initButtonHandlers,
  handleButtonInteraction
};
// handlers/modalHandler.cjs
const path = require('path');
const fs = require('fs');

const modalHandlers = [];

/**
 * Load all modal handlers from interactions/modals.
 * Each should export:
 *   - idPrefix: string (e.g. "bountyclaim_")
 *   - execute(client, interaction)
 */
function initModalHandlers(client) {
  const modalsDir = path.join(__dirname, '..', 'interactions', 'modals');

  if (!fs.existsSync(modalsDir)) {
    console.warn('⚠ No modals directory found at', modalsDir);
    return;
  }

  const files = fs.readdirSync(modalsDir).filter(f => f.endsWith('.cjs'));

  for (const file of files) {
    const fullPath = path.join(modalsDir, file);
    try {
      const mod = require(fullPath);
      if (!mod || !mod.idPrefix || typeof mod.execute !== 'function') {
        console.warn(`⚠ Skipping modal file "${file}" – missing idPrefix or execute().`);
        continue;
      }

      modalHandlers.push(mod);
      console.log(`✅ Loaded modal handler from ${file}`);
    } catch (err) {
      console.error(`❌ Error loading modal file "${file}":`, err);
    }
  }
}

async function handleModalInteraction(client, interaction) {
  const id = interaction.customId;
  const handler = modalHandlers.find(m => id.startsWith(m.idPrefix));

  if (!handler) {
    console.warn(`⚠ No modal handler for "${id}".`);
    return;
  }

  try {
    await handler.execute(client, interaction);
  } catch (err) {
    console.error(`❌ Modal handler error (${id}):`, err);

    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        content: '❌ Error while processing this form.',
        ephemeral: true
      }).catch(() => {});
    }
  }
}

module.exports = {
  initModalHandlers,
  handleModalInteraction
};
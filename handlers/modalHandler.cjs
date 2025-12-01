// handlers/modalHandler.cjs
const path = require('path');
const fs = require('fs');

const modalHandlers = [];

/**
 * Load all modal handlers from interactions/modals.
 * Each module must export:
 *   - ids: array of strings (prefixes or exact)
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

      if (!mod || !Array.isArray(mod.ids) || typeof mod.execute !== 'function') {
        console.warn(
          `⚠ Skipping modal file "${file}" – missing ids[] or execute().`
        );
        continue;
      }

      modalHandlers.push(mod);
      console.log(`✅ Loaded modal handler from ${file}`);
    } catch (err) {
      console.error(`❌ Error loading modal file "${file}":`, err);
    }
  }
}

/**
 * Route modal interactions.
 * Matches:
 *   - exact ID match
 *   - underscore prefix IDs (endsWith("_"))
 *   - pipe prefix IDs (endsWith("|"))
 */
async function handleModalInteraction(client, interaction) {
  const id = interaction.customId;

  const handler = modalHandlers.find(mod =>
    mod.ids.some(prefix => {
      // exact match
      if (id === prefix) return true;

      // prefix match: underscore style
      if (prefix.endsWith("_") && id.startsWith(prefix)) return true;

      // prefix match: pipe style
      if (prefix.endsWith("|") && id.startsWith(prefix)) return true;

      return false;
    })
  );

  if (!handler) {
    console.warn(`⚠ No modal handler for "${id}".`);
    return;
  }

  try {
    await handler.execute(client, interaction);
  } catch (err) {
    console.error(`❌ Modal handler error (${id}):`, err);

    // fallback error reply if nothing was sent
    if (!interaction.deferred && !interaction.replied) {
      await interaction
        .reply({
          content: '❌ Error while processing this form.',
          flags: 64
        })
        .catch(() => {});
    }
  }
}

module.exports = {
  initModalHandlers,
  handleModalInteraction
};

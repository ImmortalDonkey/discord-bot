// handlers/modalHandler.cjs
const path = require('path');
const fs = require('fs');

const modalHandlers = [];

/**
 * Load all modal handlers from interactions/modals.
 * Each module must export:
 *   - ids: array of strings (exact or prefix, e.g. ["bounty_claim_"])
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

      // Validate signature
      if (!mod || !Array.isArray(mod.ids) || typeof mod.execute !== 'function') {
        console.warn(`⚠ Skipping modal file "${file}" – missing ids[] or execute().`);
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
 * Route modal submissions using:
 *   - exact match
 *   - prefix match if id ends with "_"
 */
async function handleModalInteraction(client, interaction) {
  const id = interaction.customId;

  const handler = modalHandlers.find(mod =>
    mod.ids.some(prefix =>
      id === prefix ||
      (prefix.endsWith("_") && id.startsWith(prefix))
    )
  );

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
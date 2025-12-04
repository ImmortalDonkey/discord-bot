// handlers/modalHandler.cjs
const path = require('path');
const fs = require('fs');

const modalHandlers = [];

/**
 * Load all modal handlers from interactions/modals.
 * Supports:
 *   - ids: [] exact or prefix match
 *   - idPrefix: "prefix_" dynamic handlers (e.g. reporteditmodal_)
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

      const hasExecute = typeof mod.execute === 'function';
      const hasIds = Array.isArray(mod.ids);
      const hasPrefix = typeof mod.idPrefix === 'string';

      if (!hasExecute || (!hasIds && !hasPrefix)) {
        console.warn(
          `⚠ Skipping modal file "${file}" – missing ids[] or idPrefix or execute().`
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
 *   - exact ID match via ids:[]
 *   - underscore prefix ids:[…_]
 *   - pipe prefix ids:[…|]
 *   - idPrefix dynamic routed modals
 */
async function handleModalInteraction(client, interaction) {
  const id = interaction.customId;
  let handler = null;
  let dynamicId = null;

  for (const mod of modalHandlers) {
    // 🔹 If module uses dynamic prefix (e.g. reporteditmodal_)
    if (typeof mod.idPrefix === 'string' && id.startsWith(mod.idPrefix)) {
      handler = mod;
      dynamicId = id.slice(mod.idPrefix.length);
      break;
    }

    // 🔹 If module uses ids: []
    if (Array.isArray(mod.ids)) {
      const matched = mod.ids.some(prefix => {
        if (id === prefix) return true;
        if (prefix.endsWith("_") && id.startsWith(prefix)) return true;
        if (prefix.endsWith("|") && id.startsWith(prefix)) return true;
        return false;
      });

      if (matched) {
        handler = mod;
        break;
      }
    }
  }

  if (!handler) {
    console.warn(`⚠ No modal handler for "${id}".`);
    return;
  }

  try {
    // Dynamic prefix handlers receive the ID suffix
    if (dynamicId !== null) {
      await handler.execute(client, interaction, dynamicId);
    } else {
      await handler.execute(client, interaction);
    }
  } catch (err) {
    console.error(`❌ Modal handler error (${id}):`, err);

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
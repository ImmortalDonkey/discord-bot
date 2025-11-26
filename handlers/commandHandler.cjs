// handlers/commandHandler.cjs
const fs = require('fs');
const path = require('path');

let commands = new Map();

/**
 * Load all command modules from interactions/commands.
 * Each module should export:
 *   - name  (string)
 *   - execute(client, interaction)
 * OR:
 *   - data  (SlashCommandBuilder with .name)
 *   - execute(client, interaction)
 */
function initCommandHandlers(client) {
  const dir = path.join(__dirname, '..', 'interactions', 'commands');
  commands = new Map();

  if (!fs.existsSync(dir)) {
    console.warn('⚠ No commands directory found at', dir);
    client.commands = commands;
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.cjs'));

  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const mod = require(full);

      const name =
        (mod.data && mod.data.name) ||
        mod.name;

      if (!name || typeof mod.execute !== 'function') {
        console.warn(`⚠ Skipping command "${file}" – missing name or execute().`);
        continue;
      }

      commands.set(name, mod);
      console.log(`✅ Loaded command: ${name} (${file})`);
    } catch (err) {
      console.error(`❌ Failed to load command file "${file}":`, err);
    }
  }

  // Expose for debugging if you like
  client.commands = commands;
}

/**
 * Handle a chat input command interaction.
 */
async function handleCommandInteraction(client, interaction) {
  const name = interaction.commandName;
  const cmd = commands.get(name);

  if (!cmd) {
    console.warn(`⚠ No handler registered for command "${name}".`);
    return;
  }

  try {
    await cmd.execute(client, interaction);
  } catch (err) {
    console.error(`❌ Error in command "${name}":`, err);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '❌ Something went wrong executing that command.',
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: '❌ Something went wrong executing that command.',
        ephemeral: true
      }).catch(() => {});
    }
  }
}

module.exports = {
  initCommandHandlers,
  handleCommandInteraction
};
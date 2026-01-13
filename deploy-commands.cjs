// deploy-commands.cjs

// ──────────────────────────────────────
// ENV LOADING (LIVE vs DEV)
// ──────────────────────────────────────
const envFile =
  process.env.NODE_ENV === 'dev'
    ? '.env.dev'
    : '.env';

require('dotenv').config({ path: envFile });

// ──────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

// Location of your modular commands
const commandsPath = path.join(__dirname, 'interactions', 'commands');

/**
 * Load all command files dynamically.
 * Each command file must export:
 *   module.exports = {
 *     data: SlashCommandBuilder,
 *     execute: async (...) => {}
 *   }
 */
function loadCommands() {
  const commands = [];

  function readDir(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);

      if (fs.lstatSync(fullPath).isDirectory()) {
        readDir(fullPath); // support nested folders
        continue;
      }

      if (!file.endsWith('.js') && !file.endsWith('.cjs')) continue;

      const command = require(fullPath);

      if (!command.data || typeof command.data.toJSON !== 'function') {
        console.warn(`⚠ Command file missing "data": ${file}`);
        continue;
      }

      commands.push(command.data.toJSON());
    }
  }

  readDir(commandsPath);
  return commands;
}

// ──────────────────────────────────────
// LOAD COMMANDS
// ──────────────────────────────────────
const commands = loadCommands();
console.log(`📝 Loaded ${commands.length} slash commands for deployment.`);

// ──────────────────────────────────────
// DISCORD REST CLIENT
// ──────────────────────────────────────
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// ──────────────────────────────────────
// DEPLOY (HYBRID MODEL)
// ──────────────────────────────────────
(async () => {
  try {
    console.log('🚀 Deploying slash commands (hybrid mode)…');

    // 1️⃣ GLOBAL COMMANDS (subscriber guilds)
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('🌍 Global commands registered');

    // 2️⃣ MAIN GUILD COMMANDS (instant updates)
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID // MAIN guild ONLY
      ),
      { body: commands }
    );
    console.log('🏠 Main guild commands registered');

    console.log('✅ Command deployment complete');
  } catch (err) {
    console.error('❌ Failed to deploy commands:', err);
  }
})();

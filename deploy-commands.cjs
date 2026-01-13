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

function loadCommands() {
  const commands = [];

  function readDir(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);

      if (fs.lstatSync(fullPath).isDirectory()) {
        readDir(fullPath);
        continue;
      }

      if (!file.endsWith('.js') && !file.endsWith('.cjs')) continue;

      const command = require(fullPath);

      if (!command.data || !command.data.toJSON) {
        console.warn(`⚠ Command file missing "data": ${file}`);
        continue;
      }

      commands.push(command.data.toJSON());
    }
  }

  readDir(commandsPath);
  return commands;
}

const commands = loadCommands();
console.log(`📝 Loaded ${commands.length} slash commands for deployment.`);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🚀 Deploying GLOBAL slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✔ Successfully registered GLOBAL commands!');
  } catch (err) {
    console.error('❌ Failed to deploy commands:', err);
  }
})();

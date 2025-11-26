require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

// Location of your modular commands
const commandsPath = path.join(__dirname, 'interactions', 'commands');

/**
 * Load all command files dynamically
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

// Load all commands
const commands = loadCommands();
console.log(`📝 Loaded ${commands.length} slash commands for deployment.`);

// Deploy
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🚀 Deploying slash commands...');

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log('✔ Successfully registered all commands!');
  } catch (err) {
    console.error('❌ Failed to deploy commands:', err);
  }
})();

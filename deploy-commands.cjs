// deploy-commands.cjs
// ------------------------------------------------------
// HYBRID COMMAND DEPLOYMENT
//
// GLOBAL:
//   - subscriberSafe === true
//
// MAIN GUILD:
//   - ALL commands (including subscriberSafe)
//
// EXTRA GUILD:
//   - /roledeploy only
// ------------------------------------------------------

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

// 🔥 EXTRA GUILD FOR ROLEDEPLOY
const EXTRA_GUILD_ROLEDEPLOY = '1470832555694756155';

// Location of your modular commands
const commandsPath = path.join(__dirname, 'interactions', 'commands');

/**
 * Load all command modules and classify them.
 *
 * Command module flags:
 *   - subscriberSafe: true  → goes GLOBAL + MAIN GUILD
 *   - otherwise             → MAIN GUILD ONLY
 */
function loadCommands() {
  const all = [];
  const global = [];

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

      if (!command.data || typeof command.data.toJSON !== 'function') {
        console.warn(`⚠ Skipping ${file} – missing data`);
        continue;
      }

      const json = command.data.toJSON();
      all.push(json);

      if (command.subscriberSafe === true) {
        global.push(json);
      }
    }
  }

  readDir(commandsPath);

  return { all, global };
}

// ──────────────────────────────────────
// LOAD + CLASSIFY COMMANDS
// ──────────────────────────────────────
const { all: allCommands, global: globalCommands } = loadCommands();

console.log(`📝 Total commands found: ${allCommands.length}`);
console.log(`🌍 Global (subscriber-safe): ${globalCommands.length}`);
console.log(
  `🏠 Main guild only: ${allCommands.length - globalCommands.length}`
);

// ──────────────────────────────────────
// DISCORD REST CLIENT
// ──────────────────────────────────────
const rest = new REST({ version: '10' }).setToken(
  process.env.DISCORD_TOKEN
);

// ──────────────────────────────────────
// DEPLOY
// ──────────────────────────────────────
(async () => {
  try {
    console.log('🚀 Deploying commands (FINAL hybrid model)…');

    // 1️⃣ GLOBAL COMMANDS (subscriber servers)
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: globalCommands }
    );
    console.log('🌍 Global subscriber commands deployed');

    // 2️⃣ MAIN GUILD COMMANDS (all commands)
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: allCommands }
    );
    console.log('🏠 Main guild commands deployed');

    // 3️⃣ EXTRA GUILD - roledeploy only
    const roleDeployCommand = allCommands.find(
      cmd => cmd.name === 'roledeploy'
    );

    if (roleDeployCommand) {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          EXTRA_GUILD_ROLEDEPLOY
        ),
        { body: [roleDeployCommand] }
      );

      console.log('🎯 roledeploy deployed to extra subscriber guild');
    } else {
      console.log('⚠ roledeploy command not found during deploy');
    }

    console.log('✅ Command deployment COMPLETE');
  } catch (err) {
    console.error('❌ Command deployment FAILED:', err);
  }
})();

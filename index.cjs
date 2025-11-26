// index.cjs

require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials
} = require('discord.js');

const db = require('./database.cjs');

// Try to use your custom logger if available; otherwise, console.
let logger = console;
try {
  // logger should export at least .info/.error, but we'll fall back if not.
  const maybeLogger = require('./utils/logger.cjs');
  logger = {
    ...console,
    ...maybeLogger
  };
} catch {
  // no custom logger – that's fine
}

// Try to import Google Sheets init helper (optional)
let initGoogleSheet = null;
try {
  const gs = require('./utils/googleSheets.cjs');
  if (typeof gs.initGoogleSheet === 'function') {
    initGoogleSheet = gs.initGoogleSheet;
  }
} catch {
  // Sheets integration disabled / not configured
}

// Interaction handlers (central dispatchers)
const commandHandler = require('./handlers/commandHandler.cjs');
const buttonHandler = require('./handlers/buttonHandler.cjs');
const modalHandler = require('./handlers/modalHandler.cjs');
const autocompleteHandler = require('./handlers/autocompleteHandler.cjs');

// Express app (for uptime pings)
const app = express();

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// Optional: attach shared stores on the client if your utils expect them.
// (If you're already using utils/pendingStore.cjs or bountyLogic.cjs, you
// can remove these. They are just a convenient default.)
client.playerLocations = client.playerLocations || new Map();
client.pendingReports = client.pendingReports || new Map();
client.pendingBounties = client.pendingBounties || new Map();
client.activeBounties = client.activeBounties || new Map();
client.bountyClaims = client.bountyClaims || new Map();

// Ready event
client.once('ready', async () => {
  logger.info(`🤖 Logged in as ${client.user.tag}`);

  try {
    await db.init();
    logger.info('✅ Database initialised.');
  } catch (err) {
    logger.error('❌ Failed to initialise database:', err);
  }

  if (initGoogleSheet) {
    try {
      await initGoogleSheet();
      logger.info('📄 Google Sheets initialised.');
    } catch (err) {
      logger.error('❌ Failed to initialise Google Sheets:', err);
    }
  }
});

// Interaction routing
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await commandHandler(client, interaction);
    } else if (interaction.isAutocomplete()) {
      await autocompleteHandler(client, interaction);
    } else if (interaction.isButton()) {
      await buttonHandler(client, interaction);
    } else if (interaction.isModalSubmit()) {
      await modalHandler(client, interaction);
    }
  } catch (err) {
    logger.error('❌ Error handling interaction:', err);

    // Try to inform the user if possible
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: '❌ An error occurred while handling that interaction.',
          ephemeral: true
        })
        .catch(() => {});
    }
  }
});

// Login
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  logger.error('❌ Failed to login to Discord:', err);
});

// Simple web server (for uptime pings)
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Roaming Companion is running.'));
app.listen(PORT, () => {
  logger.info(`🌐 Web server running on port ${PORT}`);
});

module.exports = { client };

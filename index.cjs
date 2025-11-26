// index.cjs
require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits
} = require('discord.js');

const db = require('./database.cjs');
const { initGoogleSheet } = require('./utils/googleSheets.cjs');

// Handlers
const {
  initCommandHandlers,
  handleCommandInteraction
} = require('./handlers/commandHandler.cjs');

const {
  initButtonHandlers,
  handleButtonInteraction
} = require('./handlers/buttonHandler.cjs');

const {
  initModalHandlers,
  handleModalInteraction
} = require('./handlers/modalHandler.cjs');

const handleAutocompleteInteraction = require('./handlers/autocompleteHandler.cjs');

// ──────────────────────────────────────
// Discord client
// ──────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Shared in-memory state (used by command modules)
client.playerLocations = new Map();
client.pendingReports = new Map();
client.pendingBounties = new Map();
client.activeBounties = new Map();
client.bountyClaims = new Map();

// ──────────────────────────────────────
// Ready
// ──────────────────────────────────────
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // Initialise SQLite schema
  try {
    await db.init();
    console.log('✅ Database initialised');
  } catch (err) {
    console.error('❌ DB init failed:', err);
  }

  // Google Sheets (optional)
  try {
    await initGoogleSheet();
  } catch (err) {
    console.error('⚠ Sheets init failed:', err);
  }

  // Load handlers
  try {
    initCommandHandlers(client);
    initButtonHandlers(client);
    initModalHandlers(client);
    console.log('✅ Handlers initialised');
  } catch (err) {
    console.error('❌ Handler init failed:', err);
  }
});

// ──────────────────────────────────────
// Interaction routing
// ──────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      return handleAutocompleteInteraction(client, interaction);
    }

    if (interaction.isButton()) {
      return handleButtonInteraction(client, interaction);
    }

    if (interaction.isModalSubmit()) {
      return handleModalInteraction(client, interaction);
    }

    if (interaction.isChatInputCommand()) {
      return handleCommandInteraction(client, interaction);
    }
  } catch (err) {
    console.error('❌ Interaction error:', err);

    if (interaction.isRepliable && interaction.isRepliable()) {
      const payload = {
        content: '❌ An error occurred while processing that interaction.',
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
});

// ──────────────────────────────────────
// Login + tiny web server (for uptime pings)
// ──────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

const app = express();
app.get('/', (_req, res) => res.send('Roaming Companion – modular build running.'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));
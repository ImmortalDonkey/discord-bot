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

// FIXED autocomplete signature
const handleAutocompleteInteraction = require('./handlers/autocompleteHandler.cjs');

// ─────────────────────────────────────────────
// Discord Client
// ─────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Shared in-memory state
client.playerLocations = new Map();
client.pendingReports = new Map();
client.pendingBounties = new Map();
client.activeBounties = new Map();
client.bountyClaims = new Map();


// ─────────────────────────────────────────────
// Attach required UTILITIES for bountyrequest
// ─────────────────────────────────────────────

// rarity helpers
const rarityFile = require('./utils/rarity.cjs');
client.getRarityDisplayLabel = rarityFile.getRarityDisplayLabel;

// if you have rarityGroups/priority in their own files:
try {
  client.rarityGroups = require('./utils/rarityGroups.cjs');
} catch (_) {
  console.warn("⚠ rarityGroups.cjs not found (only required if bountyrequest uses it)");
}

try {
  client.rarityPriority = require('./utils/rarityPriority.cjs');
} catch (_) {
  console.warn("⚠ rarityPriority.cjs not found (only required if bountyrequest uses it)");
}

// highest rarity logic
try {
  client.getHighestRarityForList = require('./utils/getHighestRarityForList.cjs');
} catch (_) {
  console.warn("⚠ getHighestRarityForList.cjs not found");
}

// time utilities used by bountyrequest
const timeUtils = require('./utils/timeUtils.cjs');
client.clampHours = timeUtils.clampHours;
client.parseHourFromStartTimeString = timeUtils.parseHourFromStartTimeString;
client.getNextOccurrenceOfHour = timeUtils.getNextOccurrenceOfHour;


// ─────────────────────────────────────────────
// READY EVENT
// ─────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // DB init
  try {
    await db.init();
    console.log('✅ Database initialised');
  } catch (err) {
    console.error('❌ DB init failed:', err);
  }

  // Google Sheets init (optional)
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

  console.log('🚀 Bot is fully operational.');
});


// ─────────────────────────────────────────────
// MAIN INTERACTION ROUTER
// ─────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    // Autocomplete (NO client param)
    if (interaction.isAutocomplete()) {
      return handleAutocompleteInteraction(interaction);
    }

    // Buttons
    if (interaction.isButton()) {
      return handleButtonInteraction(client, interaction);
    }

    // Modals
    if (interaction.isModalSubmit()) {
      return handleModalInteraction(client, interaction);
    }

    // Slash commands
    if (interaction.isChatInputCommand()) {
      return handleCommandInteraction(client, interaction);
    }

  } catch (err) {
    console.error('❌ Interaction error:', err);

    const payload = {
      content: '❌ An unexpected error occurred while executing this interaction.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});


// ─────────────────────────────────────────────
// LOGIN + WEB SERVER (for uptime pings)
// ─────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

const app = express();
app.get('/', (_req, res) => res.send('Roaming Companion – modular build running.'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

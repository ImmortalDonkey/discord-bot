// index.cjs
require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits,
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

// NEW — SQLite-based bounty scheduler
const { startBountyScheduler } = require('./utils/bountyScheduler.cjs');

// NEW — report scheduler (for /report cards)
const { runReportScheduler } = require('./utils/reportScheduler.cjs');


// ──────────────────────────────────────
// DISCORD CLIENT
// ──────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ──────────────────────────────────────
// REMOVE OLD IN-MEMORY BOUNTY STORAGE
// (these are now entirely SQLite-based)
// ──────────────────────────────────────
client.playerLocations = new Map();
client.pendingReports = new Map();

// ❌ REMOVED:
// client.pendingBounties
// client.activeBounties
// client.bountyClaims
//
// No longer used. ALL bounty storage now lives in SQLite.
// Scheduler + modal + button handlers read from database only.


// ──────────────────────────────────────
// RARITY HELPERS (unchanged)
// ──────────────────────────────────────
client.rarityGroups = {
  roamerMonth: [
    "Clone Venusaur","Clone Charizard","Clone Blastoise",
    "Ancient Jigglypuff","Ancient Alakazam","Ancient Gengar",
    "Crystal Onix","Pink Rhyhorn","Snorlax (Snowman)",
    "Mewtwo (Shadow)","Golden Sudowoodo","XD001","Reddy",
    "Meta Groudon","Rayquaza (Illusion)","Dialga (Primal)","Z2"
  ],
  paradox: [
    "Walking Wake","Gouging Fire","Raging Bolt",
    "Iron Leaves","Iron Boulder","Iron Crown"
  ],
  legendary: [
    "Raikou","Entei","Suicune",
    "Latias","Latios",
    "Glastrier","Spectrier",
    "Koraidon","Miraidon"
  ],
  rare: ["Cyclizar","Gimmighoul (Roaming)"],
  common: ["Zygarde (Cell)","Bramblin","Bombirdier","Varoom"]
};

client.rarityPriority = ['paradox','roamerMonth','legendary','rare','common'];

client.getRarity = function(name) {
  name = (name || '').toLowerCase();
  for (const key of client.rarityPriority) {
    if ((client.rarityGroups[key] || [])
      .some(p => p.toLowerCase() === name)) return key;
  }
  return 'common';
};

client.getHighestRarityForList = function(list = []) {
  if (!list.length) return 'common';
  let best = 'common';
  for (const n of list) {
    const r = client.getRarity(n);
    if (client.rarityPriority.indexOf(r) < client.rarityPriority.indexOf(best))
      best = r;
  }
  return best;
};

client.getRarityDisplayLabel = function(key) {
  if (key === 'paradox') return 'Paradox';
  if (key === 'roamerMonth') return 'Roamer of the Month';
  if (key === 'legendary' || key === 'rare') return 'Legendary / Rare';
  return 'Common';
};


// ──────────────────────────────────────
// READY EVENT
// ──────────────────────────────────────
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // SQLite
  try {
    await db.init();
    console.log('✅ Database initialised');
  } catch (err) {
    console.error('❌ DB init failed:', err);
  }

  // Google Sheets (non-bounty)
  try {
    await initGoogleSheet();
  } catch (err) {
    console.error('⚠ Sheets init failed:', err);
  }

  // Load all handlers
  try {
    initCommandHandlers(client);
    initButtonHandlers(client);
    initModalHandlers(client);
    console.log('✅ Handlers initialised');
  } catch (err) {
    console.error('❌ Handler init failed:', err);
  }

  // Start the NEW SQLite bounty scheduler
  try {
    startBountyScheduler(client);
    console.log('⏱️ Bounty scheduler online');
  } catch (err) {
    console.error('❌ Failed to start bounty scheduler:', err);
  }

  // Start report scheduler loop (runs every 60 seconds)
  try {
    setInterval(() => {
      runReportScheduler(client).catch(err => {
        console.error('❌ Report scheduler error:', err);
      });
    }, 60 * 1000);

    console.log('⏱️ Report scheduler online');
  } catch (err) {
    console.error('❌ Failed to start report scheduler:', err);
  }
});


// ──────────────────────────────────────
// INTERACTION HANDLING
// ──────────────────────────────────────
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      return handleAutocompleteInteraction(interaction);
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

    const payload = {
      content: '❌ Error while processing interaction.',
      ephemeral: true
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch {}
  }
});


// ──────────────────────────────────────
// LOGIN + EXPRESS HEARTBEAT
// ──────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

const app = express();
app.get('/', (_req, res) => res.send('Roaming Companion running.'));
app.listen(3000, () => console.log('🌐 Web server on port 3000'));

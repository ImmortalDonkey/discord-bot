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

// Autocomplete (NO client parameter)
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

// Shared state
client.playerLocations = new Map();
client.pendingReports = new Map();
client.pendingBounties = new Map();
client.activeBounties = new Map();
client.bountyClaims = new Map();


// ──────────────────────────────────────
// REQUIRED HELPERS FOR BOUNTYREQUEST
// (These were missing & caused the command to break)
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

client.clampHours = function(h) {
  if (!h || isNaN(h)) return 6;
  h = parseInt(h);
  if (h < 1) h = 1;
  if (h > 72) h = 72;
  return h;
};

client.parseHourFromStartTimeString = function(str) {
  if (!str || typeof str !== 'string') return 0;
  if (str === 'now') return 0;
  const hour = parseInt(str.split(':')[0], 10);
  return isNaN(hour) ? 0 : hour;
};

client.getNextOccurrenceOfHour = function(hour) {
  const now = new Date();
  const start = new Date(now);
  start.setMinutes(0,0,0);
  start.setHours(hour);
  if (start <= now) start.setDate(start.getDate() + 1);
  return start;
};


// ──────────────────────────────────────
// Ready
// ──────────────────────────────────────
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  try {
    await db.init();
    console.log('✅ Database initialised');
  } catch (err) {
    console.error('❌ DB init failed:', err);
  }

  try {
    await initGoogleSheet();
  } catch (err) {
    console.error('⚠ Sheets init failed:', err);
  }

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
      content: '❌ An error occurred while processing that interaction.',
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
// Login + web server
// ──────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

const app = express();
app.get('/', (_req, res) => res.send('Roaming Companion – modular build running.'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

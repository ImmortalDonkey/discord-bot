// app.cjs
require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

// Database + Google Sheets
const db = require('./database.cjs');
const { initGoogleSheet } = require('./utils/time.cjs'); // you may move sheet init here later

// Handlers
const handleCommand = require('./handlers/commandHandler.cjs');
const handleButton = require('./handlers/buttonHandler.cjs');
const handleModal = require('./handlers/modalHandler.cjs');
const handleAutocomplete = require('./handlers/autocompleteHandler.cjs');

// ==================================================
// DISCORD CLIENT
// ==================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ==================================================
// INTERACTION ROUTER
// ==================================================
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      return handleCommand(client, interaction);
    }
    if (interaction.isButton()) {
      return handleButton(client, interaction);
    }
    if (interaction.isModalSubmit()) {
      return handleModal(client, interaction);
    }
    if (interaction.isAutocomplete()) {
      return handleAutocomplete(client, interaction);
    }
  } catch (err) {
    console.error('❌ Interaction error:', err);
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

// ==================================================
// READY EVENT
// ==================================================
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  await db.init();

  // Initialize Google Sheets (safe fallback if disabled)
  if (initGoogleSheet) {
    try {
      await initGoogleSheet();
    } catch (err) {
      console.log("⚠ Google Sheets failed:", err.message);
    }
  }
});

// ==================================================
// LOGIN + KEEP-ALIVE SERVER
// ==================================================
client.login(process.env.DISCORD_TOKEN);

const app = express();
app.get("/", (_, res) => res.send("Bot running (app.cjs)"));
app.listen(3000, () => console.log("🌐 Keep-alive server on port 3000"));


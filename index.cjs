require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const {
  Client,
  GatewayIntentBits,
  Collection,
} = require('discord.js');

const db = require('./database.cjs');

// ─────────────────────────────────────────────
// CREATE CLIENT
// ─────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ─────────────────────────────────────────────
// STORAGE FOR COMMANDS / BUTTONS / MODALS
// ─────────────────────────────────────────────
client.commands = new Collection();
client.buttons = new Collection();
client.modals = new Collection();
client.autocomplete = new Collection();

// ─────────────────────────────────────────────
// HELPERS TO LOAD MODULES
// ─────────────────────────────────────────────
function loadModules(dir, collection) {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) return;

  for (const file of fs.readdirSync(fullPath)) {
    if (!file.endsWith('.cjs')) continue;

    const modulePath = path.join(fullPath, file);
    const mod = require(modulePath);

    if (!mod || !mod.customId && !mod.name)
      continue;

    const key = mod.customId || mod.name;
    collection.set(key, mod);

    console.log(`Loaded: ${dir}/${file}`);
  }
}

// ─────────────────────────────────────────────
// LOAD COMMANDS / BUTTONS / MODALS / AUTOCOMPLETE
// ─────────────────────────────────────────────
loadModules('interactions/commands', client.commands);
loadModules('interactions/buttons', client.buttons);
loadModules('interactions/modals', client.modals);
loadModules('interactions/autocomplete', client.autocomplete);

// ─────────────────────────────────────────────
// INTERACTION HANDLER
// ─────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  
  try {

    // SLASH COMMANDS
    if (interaction.isCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return interaction.reply({ content: '❌ Command not found.', ephemeral: true });
      return await cmd.execute(interaction, client);
    }

    // BUTTONS
    if (interaction.isButton()) {
      for (const [id, handler] of client.buttons) {
        if (interaction.customId.startsWith(id)) {
          return await handler.execute(interaction, client);
        }
      }
    }

    // MODALS
    if (interaction.isModalSubmit()) {
      for (const [id, handler] of client.modals) {
        if (interaction.customId.startsWith(id)) {
          return await handler.execute(interaction, client);
        }
      }
    }

    // AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
      const handler = client.autocomplete.get(interaction.commandName);
      if (handler) return handler.execute(interaction, client);
    }

  } catch (err) {
    console.error('❌ Interaction error:', err);
    return interaction.reply({ content: '❌ Error processing interaction.', ephemeral: true })
      .catch(() => {});
  }
});

// ─────────────────────────────────────────────
// READY EVENT
// ─────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await db.init();
});

// ─────────────────────────────────────────────
// LOGIN + EXPRESS (for UptimeRobot / Render)
// ─────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

const app = express();
app.get('/', (_, res) => res.send("Bot Online"));
app.listen(3000, () => console.log("🌍 Webserver online on port 3000"));

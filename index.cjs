// index.cjs

const envFile =
  process.env.NODE_ENV === 'dev'
    ? '.env.dev'
    : '.env';

require('dotenv').config({ path: envFile });

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
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

// Schedulers
const { startBountyScheduler } = require('./utils/bountyScheduler.cjs');
const { runReportScheduler } = require('./utils/reportScheduler.cjs');

// ──────────────────────────────────────
// DISCORD CLIENT
// ──────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ──────────────────────────────────────
// REMOVE OLD MEMORY STORAGE
// ──────────────────────────────────────
client.playerLocations = new Map();
client.pendingReports = new Map();

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

  // ✅ DB MUST INIT FIRST
  try {
    await db.init();
    console.log('✅ Database initialised');
  } catch (err) {
    console.error('❌ DB init failed:', err);
  }

  // ──────────────────────────────────────
  // 📌 ENSURE #roles "Change roles" MESSAGE
  // ──────────────────────────────────────
  try {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const channel = guild.channels.cache.get(process.env.CHANNEL_ROLES);
    if (!channel) throw new Error('CHANNEL_ROLES not found');

    let existingId = await db.getMeta('roles_message_id');

    if (existingId) {
      const existingMsg = await channel.messages.fetch(existingId).catch(() => null);
      if (existingMsg) {
        console.log('✅ Roles message already exists');
        existingId = null;
      } else {
        await db.setMeta('roles_message_id', null);
      }
    }

    if (!existingId) {
      const embed = new EmbedBuilder()
        .setTitle('Choose your roles')
        .setDescription(
          'The roles you select will determine what you receive notifications for.\n\n' +
          '• Roaming Pokémon alerts (by rarity)\n' +
          '• Gameplay roles (Bounty, Mob, Witch Hunting)\n\n' +
          'You can change these at any time.\n\n' +
          '⬇️ Click the button below to update your roles.'
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('roles_open')
          .setLabel('Change roles')
          .setStyle(ButtonStyle.Primary)
      );

      const msg = await channel.send({
        embeds: [embed],
        components: [row]
      });

      await db.setMeta('roles_message_id', msg.id);
      console.log('✅ Roles message created');
    }
  } catch (err) {
    console.error('❌ Failed to ensure roles message:', err);
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

  try {
    startBountyScheduler(client);
    console.log('⏱️ Bounty scheduler online');
  } catch (err) {
    console.error('❌ Failed to start bounty scheduler:', err);
  }

  function scheduleReports() {
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000;

    setTimeout(() => {
      setInterval(() => {
        runReportScheduler(client).catch(err =>
          console.error('❌ Report scheduler error:', err)
        );
      }, 60 * 1000);

      runReportScheduler(client).catch(err =>
        console.error('❌ Report scheduler error:', err)
      );
    }, msToNextMinute);
  }

  scheduleReports();
  console.log('⏱ Report scheduler aligned and online');
});

// ──────────────────────────────────────
// INTERACTIONS
// ──────────────────────────────────────
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isAutocomplete()) return handleAutocompleteInteraction(interaction);
    if (interaction.isButton()) return handleButtonInteraction(client, interaction);
    if (interaction.isModalSubmit()) return handleModalInteraction(client, interaction);
    if (interaction.isChatInputCommand()) return handleCommandInteraction(client, interaction);
  } catch (err) {
    console.error('❌ Interaction error:', err);
    const payload = { content: '❌ Error while processing interaction.', ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch {}
  }
});

// ──────────────────────────────────────
// DEV-ONLY ONBOARDING
// ──────────────────────────────────────
if (process.env.ENV === 'dev') {
  const onboardingHandler = require('./events/guildMemberAdd.cjs');

  client.on('guildMemberAdd', async member => {
    try {
      await onboardingHandler(client, member);
    } catch (err) {
      console.error('❌ Onboarding error:', err);
    }
  });

  console.log('🧪 Onboarding ENABLED (DEV ONLY)');
} else {
  console.log('🛑 Onboarding DISABLED (LIVE)');
}

// ──────────────────────────────────────
// LOGIN + HEARTBEAT
// ──────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

const app = express();
app.get('/', (_req, res) => res.send('Roaming Companion running.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server on port ${PORT}`));

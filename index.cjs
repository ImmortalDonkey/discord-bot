// index.cjs
require('dotenv').config();

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
const { getRankName } = require('./utils/rankSystem.cjs');
const {
  getHighestRarityForList,
  getRarityDisplayLabel
} = require('./utils/rarity.cjs');
const { createBountyCard } = require('./renderers/cardRenderer.cjs');
const fs = require('fs');
const path = require('path');

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

// Timers for scheduled bounties (Option C)
client.bountyStartTimers = new Map();


// ──────────────────────────────────────
// Rarity helpers (legacy compatibility)
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
// Bounty helpers – Option C scheduler
// ──────────────────────────────────────

/**
 * Map rarity -> role IDs from .env for bounty pings
 * ROLE_BOUNTY_PARADOX
 * ROLE_BOUNTY_ROAMER_MONTH
 * ROLE_BOUNTY_LEGENDARY
 * ROLE_BOUNTY_COMMON
 * ROLE_BOUNTY_ALL
 */
function getRarityPingString(rarityKey) {
  const all = process.env.ROLE_BOUNTY_ALL || null;

  let ids = [];

  if (rarityKey === 'paradox' && process.env.ROLE_BOUNTY_PARADOX) {
    ids.push(process.env.ROLE_BOUNTY_PARADOX);
  } else if (rarityKey === 'roamerMonth' && process.env.ROLE_BOUNTY_ROAMER_MONTH) {
    ids.push(process.env.ROLE_BOUNTY_ROAMER_MONTH);
  } else if (
    (rarityKey === 'legendary' || rarityKey === 'rare') &&
    process.env.ROLE_BOUNTY_LEGENDARY
  ) {
    ids.push(process.env.ROLE_BOUNTY_LEGENDARY);
  } else if (rarityKey === 'common' && process.env.ROLE_BOUNTY_COMMON) {
    ids.push(process.env.ROLE_BOUNTY_COMMON);
  }

  if (!ids.length && all) {
    ids.push(all);
  }

  if (!ids.length) return '';
  return ids
    .map(id => `<@&${String(id).trim()}>`)
    .join(' ');
}

/**
 * Build options object for cardRenderer.cjs from a bounty.
 */
async function buildBountyCardOptions(client, bounty, guild) {
  // Fetch member / user
  let member = null;
  try {
    member = await guild.members.fetch(bounty.requesterId);
  } catch {
    member = null;
  }

  const user = member?.user || (await client.users.fetch(bounty.requesterId).catch(() => null));

  const username =
    member?.displayName ||
    user?.username ||
    bounty.requesterName ||
    'Unknown Trainer';

  const avatarUrl =
    user?.displayAvatarURL({ extension: 'png', size: 512 }) ||
    client.user.displayAvatarURL({ extension: 'png', size: 512 });

  // Rank from DB lifetime_points
  const row = await db.getUserById(bounty.requesterId).catch(() => null);
  const lifetime = row?.lifetime_points || 0;
  const rankName = getRankName(lifetime);

  const pokemons = bounty.pokemons || [];
  const rarityKey = getHighestRarityForList(pokemons);
  const rarityLabel = getRarityDisplayLabel(rarityKey);

  const startLabel = bounty.startTime.toLocaleString('en-GB', {
    hour12: false
  });
  const endLabel = bounty.endTime.toLocaleString('en-GB', {
    hour12: false
  });
  const durationLabel = `${bounty.durationHours} hour(s)`;
  const rewardLabel = `${bounty.reward.toLocaleString()} PKD`;

  return {
    bountyId: bounty.id,
    username,
    rankName,
    rarityKey,
    rarityLabel,
    pokemons,
    startLabel,
    endLabel,
    durationLabel,
    note: bounty.notes || '',
    rewardLabel,
    avatarUrl
  };
}

/**
 * Actually start a bounty:
 * - Delete announcement (if any)
 * - Post card PNG with claim button
 * - Add to client.activeBounties
 */
client.startBountyNow = async function startBountyNow(bounty, guild, bountyChannel, announcementMessage) {
  const pokemons = bounty.pokemons || [];
  const rarityKey = getHighestRarityForList(pokemons);
  const rarityLabel = getRarityDisplayLabel(rarityKey);
  const ping = getRarityPingString(rarityKey);

  // Delete announcement if it exists
  if (announcementMessage) {
    try {
      await announcementMessage.delete();
    } catch {
      // ignore
    }
  }

  // Build card + write PNG
  const cardOptions = await buildBountyCardOptions(client, bounty, guild);
  const cardPath = await createBountyCard(cardOptions);

  // Claim button
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claimbounty_${bounty.id}`)
      .setLabel('Claim Bounty')
      .setStyle(ButtonStyle.Success)
  );

  const msg = await bountyChannel.send({
    content: ping || undefined,
    files: [cardPath],
    components: [row]
  });

  // Track in memory for /activebounties + claim flow
  bounty.guildId = guild.id;
  bounty.cardPath = cardPath;
  bounty.cardMessageId = msg.id;
  bounty.rarityKey = rarityKey;
  bounty.rarityLabel = rarityLabel;

  client.activeBounties.set(bounty.id, bounty);
};

/**
 * Called from the Approve button handler:
 * - If startsNow: start immediately, no announcement embed
 * - If scheduled: post announcement and schedule start
 * - Also saves scheduled bounties into SQLite (Option C)
 */
client.handleApprovedBounty = async function handleApprovedBounty(bounty, interaction) {
  const guild = interaction.guild;
  const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;

  if (!bountyChannelId) {
    return interaction.reply({
      content: '❌ BOUNTY_CHANNEL_ID is not configured.',
      ephemeral: true
    });
  }

  const bountyChannel = await guild.channels.fetch(bountyChannelId).catch(() => null);
  if (!bountyChannel) {
    return interaction.reply({
      content: '❌ Could not find the bounty channel. Check BOUNTY_CHANNEL_ID.',
      ephemeral: true
    });
  }

  // Mark guild
  bounty.guildId = guild.id;

  const pokemons = bounty.pokemons || [];
  const rarityKey = getHighestRarityForList(pokemons);
  const rarityLabel = getRarityDisplayLabel(rarityKey);
  const ping = getRarityPingString(rarityKey);

  // START NOW → no announcement, card immediately
  if (bounty.startsNow) {
    await client.startBountyNow(bounty, guild, bountyChannel, null);

    // Remove from pending
    client.pendingBounties.delete(bounty.id);

    return interaction.update({
      content: `✅ Bounty approved and activated immediately in <#${bountyChannelId}>.`,
      embeds: [],
      components: []
    });
  }

  // SCHEDULED START → announcement embed + timer + DB row
  const startUnix = Math.floor(bounty.startTime.getTime() / 1000);
  const endUnix = Math.floor(bounty.endTime.getTime() / 1000);

  const pokemonLines = pokemons.length
    ? pokemons.map(p => `• ${p}`).join('\n')
    : '—';

  const announceEmbed = new EmbedBuilder()
    .setTitle('⏰ Scheduled Bounty')
    .setDescription('A bounty has been approved and will start soon!')
    .addFields(
      { name: 'Trainer', value: `<@${bounty.requesterId}>`, inline: true },
      { name: 'Rarity', value: rarityLabel, inline: true },
      { name: 'Reward', value: `${bounty.reward.toLocaleString()} PKD`, inline: false },
      { name: 'Targets', value: pokemonLines, inline: false },
      { name: 'Starts', value: `<t:${startUnix}:F>`, inline: false },
      { name: 'Ends', value: `<t:${endUnix}:F>`, inline: false },
      { name: 'Duration', value: `${bounty.durationHours} hour(s)`, inline: true },
      { name: 'Note', value: bounty.notes || '—', inline: false }
    )
    .setTimestamp();

  const announceMessage = await bountyChannel.send({
    content: ping || undefined,
    embeds: [announceEmbed]
  });

  // Save to DB (Option C)
  await db.saveScheduledBounty(
    bounty,
    bountyChannel.id,
    announceMessage.id
  );

  // Schedule timer
  const delay = bounty.startTime.getTime() - Date.now();
  const safeDelay = Math.max(delay, 0);

  const timeout = setTimeout(async () => {
    try {
      // Re-fetch guild + channel in case caches changed
      const g = await client.guilds.fetch(bounty.guildId).catch(() => null);
      if (!g) return;

      const ch = await g.channels.fetch(announceMessage.channelId).catch(() => null);
      if (!ch) return;

      let msg = null;
      try {
        msg = await ch.messages.fetch(announceMessage.id);
      } catch {
        msg = null;
      }

      await client.startBountyNow(bounty, g, ch, msg);
      await db.deleteScheduledBounty(bounty.id);
      client.bountyStartTimers.delete(bounty.id);
    } catch (err) {
      console.error('❌ Error running scheduled bounty:', err);
    }
  }, safeDelay);

  client.bountyStartTimers.set(bounty.id, timeout);
  client.pendingBounties.delete(bounty.id);

  return interaction.update({
    content: `✅ Bounty approved. Announcement posted in <#${bountyChannelId}>.`,
    embeds: [],
    components: []
  });
};

/**
 * On startup: restore scheduled bounties from SQLite and
 * recreate timers for any that have not started yet.
 */
client.restoreScheduledBounties = async function restoreScheduledBounties() {
  const rows = await db.getAllScheduledBounties().catch(() => []);
  if (!rows.length) return;

  const now = Date.now();
  console.log(`🔄 Restoring ${rows.length} scheduled bounty(ies) from DB...`);

  for (const row of rows) {
    try {
      const startTime = new Date(row.start_time);
      const endTime = new Date(row.end_time);

      // If already expired, just drop it
      if (!startTime || isNaN(startTime.getTime()) || startTime.getTime() <= now) {
        await db.deleteScheduledBounty(row.id);
        continue;
      }

      const bounty = {
        id: row.id,
        guildId: row.guild_id,
        requesterId: row.requester_id,
        requesterName: row.requester_name,
        pokemons: JSON.parse(row.pokemons || '[]'),
        notes: row.notes,
        startTime,
        endTime,
        durationHours: row.duration_hours,
        reward: row.reward,
        createdAt: new Date(row.created_at || now),
        startsNow: false
      };

      const guild = await client.guilds.fetch(bounty.guildId).catch(() => null);
      if (!guild) continue;

      const bountyChannel = await guild.channels
        .fetch(row.announcement_channel_id)
        .catch(() => null);
      if (!bountyChannel) continue;

      let announcementMessage = null;
      try {
        announcementMessage = await bountyChannel.messages.fetch(row.announcement_message_id);
      } catch {
        announcementMessage = null;
      }

      const delay = startTime.getTime() - now;
      const safeDelay = Math.max(delay, 0);

      const timeout = setTimeout(async () => {
        try {
          const g = await client.guilds.fetch(bounty.guildId).catch(() => null);
          if (!g) return;

          const ch = await g.channels.fetch(row.announcement_channel_id).catch(() => null);
          if (!ch) return;

          let msg = null;
          try {
            msg = await ch.messages.fetch(row.announcement_message_id);
          } catch {
            msg = null;
          }

          await client.startBountyNow(bounty, g, ch, msg);
          await db.deleteScheduledBounty(bounty.id);
          client.bountyStartTimers.delete(bounty.id);
        } catch (err) {
          console.error('❌ Error running restored scheduled bounty:', err);
        }
      }, safeDelay);

      client.bountyStartTimers.set(bounty.id, timeout);
    } catch (err) {
      console.error('❌ Error restoring scheduled bounty row:', err);
    }
  }
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

  // Restore scheduled bounties (Option C)
  try {
    await client.restoreScheduledBounties();
  } catch (err) {
    console.error('❌ Failed to restore scheduled bounties:', err);
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
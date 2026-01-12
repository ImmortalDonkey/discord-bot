// handlers/commandHandler.cjs
const fs = require('fs');
const path = require('path');

const db = require('../database.cjs');

let commands = new Map();

/**
 * Subscriber guild command allowlist (LOCKED)
 * - Main guild: all commands allowed
 * - Subscriber guilds: only these commands allowed
 */
const SUBSCRIBER_ALLOWED = new Set([
  'report',
  'reportdebug',
  'reportconfig',
  'leaderboard',
  'ign'
]);

function isMainGuild(guildId) {
  return !!guildId && guildId === process.env.GUILD_ID;
}

async function enforceGuildCommandPolicy(interaction) {
  // No guild = DM / unknown context
  if (!interaction.guildId) {
    return {
      allowed: false,
      reason: '❌ This command can only be used inside a server.'
    };
  }

  // Main guild: everything allowed
  if (isMainGuild(interaction.guildId)) {
    return { allowed: true };
  }

  // Subscriber guild: must be enabled in DB + command allowlisted
  const subscriber = await db.getSubscriberGuild(interaction.guildId);

  if (!subscriber) {
    return {
      allowed: false,
      reason:
        '❌ This server is not onboarded for Roaming Companion yet.\n' +
        'Ask an admin to complete subscriber setup (report channel + roles).'
    };
  }

  const cmdName = interaction.commandName;

  if (!SUBSCRIBER_ALLOWED.has(cmdName)) {
    return {
      allowed: false,
      reason:
        '❌ This command is not available in subscriber servers.\n' +
        'Available here: /report, /reportconfig, /leaderboard, /ign, /reportdebug (staff).'
    };
  }

  return { allowed: true };
}

/**
 * Load all command modules from interactions/commands.
 * Each module should export:
 *   - name  (string)
 *   - execute(client, interaction)
 * OR:
 *   - data  (SlashCommandBuilder with .name)
 *   - execute(client, interaction)
 */
function initCommandHandlers(client) {
  const dir = path.join(__dirname, '..', 'interactions', 'commands');
  commands = new Map();

  if (!fs.existsSync(dir)) {
    console.warn('⚠ No commands directory found at', dir);
    client.commands = commands;
    return;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.cjs'));

  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const mod = require(full);

      const name = (mod.data && mod.data.name) || mod.name;

      if (!name || typeof mod.execute !== 'function') {
        console.warn(
          `⚠ Skipping command "${file}" – missing name or execute().`
        );
        continue;
      }

      commands.set(name, mod);
      console.log(`✅ Loaded command: ${name} (${file})`);
    } catch (err) {
      console.error(`❌ Failed to load command file "${file}":`, err);
    }
  }

  // Expose for debugging if you like
  client.commands = commands;
}

/**
 * Handle a chat input command interaction.
 */
async function handleCommandInteraction(client, interaction) {
  const name = interaction.commandName;
  const cmd = commands.get(name);

  if (!cmd) {
    console.warn(`⚠ No handler registered for command "${name}".`);
    return;
  }

  // ──────────────────────────────
  // GUILD COMMAND POLICY (MAIN vs SUBSCRIBER)
  // ──────────────────────────────
  try {
    const policy = await enforceGuildCommandPolicy(interaction);

    if (!policy.allowed) {
      if (interaction.replied || interaction.deferred) {
        await interaction
          .followUp({
            content: policy.reason || '❌ Not allowed here.',
            ephemeral: true
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content: policy.reason || '❌ Not allowed here.',
            ephemeral: true
          })
          .catch(() => {});
      }
      return;
    }
  } catch (err) {
    console.error('❌ Command policy check failed:', err);
    // Fail closed in subscriber guilds, but keep main usable
    if (!isMainGuild(interaction.guildId)) {
      if (interaction.replied || interaction.deferred) {
        await interaction
          .followUp({
            content:
              '❌ This server is not configured correctly for Roaming Companion yet.',
            ephemeral: true
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content:
              '❌ This server is not configured correctly for Roaming Companion yet.',
            ephemeral: true
          })
          .catch(() => {});
      }
      return;
    }
  }

  // ──────────────────────────────
  // EXECUTE COMMAND
  // ──────────────────────────────
  try {
    await cmd.execute(client, interaction);
  } catch (err) {
    console.error(`❌ Error in command "${name}":`, err);

    if (interaction.replied || interaction.deferred) {
      await interaction
        .followUp({
          content: '❌ Something went wrong executing that command.',
          ephemeral: true
        })
        .catch(() => {});
    } else {
      await interaction
        .reply({
          content: '❌ Something went wrong executing that command.',
          ephemeral: true
        })
        .catch(() => {});
    }
  }
}

module.exports = {
  initCommandHandlers,
  handleCommandInteraction
};
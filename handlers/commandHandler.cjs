// handlers/commandHandler.cjs

const fs = require('fs');
const path = require('path');
const db = require('../database.cjs');

let commands = new Map();

function isMainGuild(guildId) {
  return !!guildId && guildId === process.env.GUILD_ID;
}

/**
 * Enforce command availability rules.
 *
 * RULES:
 * - Main guild: all commands allowed
 * - Subscriber guild:
 *   - Guild must be onboarded
 *   - Command must NOT be mainGuildOnly
 *   - Command must be subscriberSafe
 */
async function enforceGuildCommandPolicy(interaction, cmd) {
  // No guild context
  if (!interaction.guildId) {
    return {
      allowed: false,
      reason: '❌ This command can only be used inside a server.'
    };
  }

  // Main guild → everything allowed
  if (isMainGuild(interaction.guildId)) {
    return { allowed: true };
  }

  // Subscriber guild → must exist in DB
  const subscriber = await db.getSubscriberGuild(interaction.guildId);

  if (!subscriber) {
    return {
      allowed: false,
      reason:
        '❌ This server is not onboarded for Roaming Companion yet.\n' +
        'Ask an admin to complete subscriber setup.'
    };
  }

  // MAIN-GUILD-ONLY commands are blocked
  if (cmd.mainGuildOnly) {
    return {
      allowed: false,
      reason:
        '❌ This command is only available in the main Roaming Companion server.'
    };
  }

  // Must be explicitly subscriber-safe
  if (!cmd.subscriberSafe) {
    return {
      allowed: false,
      reason:
        '❌ This command is not available in subscriber servers.'
    };
  }

  return { allowed: true };
}

/**
 * Load all command modules from interactions/commands.
 */
function initCommandHandlers(client) {
  const dir = path.join(__dirname, '..', 'interactions', 'commands');
  commands = new Map();

  if (!fs.existsSync(dir)) {
    console.warn('⚠ No commands directory found at', dir);
    client.commands = commands;
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.cjs'));

  for (const file of files) {
    const full = path.join(dir, file);

    try {
      const mod = require(full);
      const name = (mod.data && mod.data.name) || mod.name;

      if (!name || typeof mod.execute !== 'function') {
        console.warn(`⚠ Skipping "${file}" – missing name or execute().`);
        continue;
      }

      commands.set(name, mod);
      console.log(`✅ Loaded command: ${name}`);
    } catch (err) {
      console.error(`❌ Failed to load "${file}":`, err);
    }
  }

  client.commands = commands;
}

/**
 * Handle slash command execution.
 */
async function handleCommandInteraction(client, interaction) {
  const name = interaction.commandName;
  const cmd = commands.get(name);

  if (!cmd) {
    console.warn(`⚠ No handler registered for "${name}".`);
    return;
  }

  // ──────────────────────────────
  // POLICY CHECK
  // ──────────────────────────────
  try {
    const policy = await enforceGuildCommandPolicy(interaction, cmd);

    if (!policy.allowed) {
      const payload = {
        content: policy.reason || '❌ Not allowed here.',
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
      return;
    }
  } catch (err) {
    console.error('❌ Command policy check failed:', err);

    if (!isMainGuild(interaction.guildId)) {
      const payload = {
        content:
          '❌ This server is not configured correctly for Roaming Companion.',
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
      return;
    }
  }

  // ──────────────────────────────
  // EXECUTE
  // ──────────────────────────────
  try {
    await cmd.execute(client, interaction);
  } catch (err) {
    console.error(`❌ Error executing "${name}":`, err);

    const payload = {
      content: '❌ Something went wrong executing that command.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

module.exports = {
  initCommandHandlers,
  handleCommandInteraction
};

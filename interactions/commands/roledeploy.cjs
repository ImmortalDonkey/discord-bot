/**
 * /roledeploy
 *
 * Deploys the Roamer Notification role panel.
 *
 * RULES (LOCKED):
 * - MAIN guild only (never global, never subscriber)
 * - Staff-only via STAFF_ROLES env
 * - Uses CHANNEL_ROLES env
 * - Uses LOCAL sprite files from /sprites
 * - Always clears & redeploys entire panel
 */

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const fs = require('fs');
const path = require('path');

// ──────────────────────────────
// ENV
// ──────────────────────────────
const PANEL_CHANNEL_ID = process.env.CHANNEL_ROLES;

const STAFF_ROLES = (process.env.STAFF_ROLES || '')
  .split(',')
  .map(r => r.trim())
  .filter(Boolean);

// ──────────────────────────────
// LOCAL SPRITES
// ──────────────────────────────
const SPRITES_DIR = path.join(__dirname, '..', '..', 'sprites');

// ──────────────────────────────
// ROLES CONFIG (SOURCE OF TRUTH)
// ──────────────────────────────
const rolesConfig = require('../../utils/rolesConfig.cjs');

// ──────────────────────────────
// HELPERS
// ──────────────────────────────
function hasStaffRole(member) {
  return STAFF_ROLES.some(id => member.roles.cache.has(id));
}

function envToPokemonKey(env) {
  return env.replace(/^ROLE_POKEMON_/, '').toLowerCase();
}

const normalize = s =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function getSpriteForLabel(label) {
  if (!label) return null;

  const exact = path.join(SPRITES_DIR, `${label}.png`);
  if (fs.existsSync(exact)) {
    return { attachment: exact, name: `${label}.png` };
  }

  const target = normalize(label);
  const files = fs.readdirSync(SPRITES_DIR);

  const found = files.find(f =>
    normalize(path.basename(f, path.extname(f))) === target
  );

  return found
    ? { attachment: path.join(SPRITES_DIR, found), name: found }
    : null;
}

// ──────────────────────────────
// COMMAND
// ──────────────────────────────
module.exports = {
  mainGuildOnly: true,

  data: new SlashCommandBuilder()
    .setName('roledeploy')
    .setDescription('Deploy the roamer notification role panel'),

  async execute(client, interaction) {
    if (!hasStaffRole(interaction.member)) {
      return interaction.reply({
        content: '❌ You do not have permission to use this command.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: '⏳ Deploying role panel…',
      ephemeral: true
    });

    const channel = await client.channels
      .fetch(PANEL_CHANNEL_ID)
      .catch(() => null);

    if (!channel) {
      return interaction.editReply('❌ Role panel channel not found.');
    }

    // Clear channel
    try {
      const msgs = await channel.messages.fetch({ limit: 100 });
      if (msgs.size) await channel.bulkDelete(msgs, true).catch(() => {});
    } catch {}

    // ──────────────────────────────
    // INTRO + GLOBAL ACTIONS (UPDATED TEXT ONLY)
    // ──────────────────────────────
    await channel.send({
      embeds: [{
        title: '🔔 Roamer Notification Preferences',
        color: 0xf59e0b,
        description: [
          'Use this channel to choose which roaming Pokémon notifications you want to receive.',
          '',
          '• Select **rarity groups** to receive notifications for *all* Pokémon of that rarity',
          '• Select **individual Pokémon** to receive notifications for *specific roamers only*',
          '',
          '**Buttons explained:**',
          '• **ON / OFF** — turn notifications on or off for that rarity group or Pokémon',
          '• **View my notifications** — shows a private list of all your current selections',
          '  *(This appears as a private message at the bottom of the channel, visible only to you.)*',
          '• **Clear all** — removes **all** roaming notification roles (both rarity groups and individual Pokémon)',
          '',
          'You can change your preferences at any time, and your selections take effect immediately.'
        ].join('\n')
      }],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('roles_view_status')
            .setLabel('View my notifications')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('roles_clear_all')
            .setLabel('Clear all')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });

    // ──────────────────────────────
    // RARITY GROUPS (TEXT + ON/OFF)
    // ──────────────────────────────
    for (const r of rolesConfig.rarityRoles) {
      const rarityKey = r.env.replace(/^ROLE_/, '').toLowerCase();

      await channel.send({
        embeds: [{
          title: r.label,
          color: 0x64748b
        }],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`roles_manage_${process.env[r.env]}:on`)
              .setLabel('ON')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`roles_manage_${process.env[r.env]}:off`)
              .setLabel('OFF')
              .setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    }

    // ──────────────────────────────
    // INDIVIDUAL POKÉMON (1 PER MESSAGE)
    // ──────────────────────────────
    const orderedGroups = [
      'paradox',
      'roamerMonth',
      'legendary',
      'rare',
      'common'
    ];

    for (const group of orderedGroups) {
      const pokemon = rolesConfig.pokemonRoles.filter(p => p.group === group);

      for (const p of pokemon) {
        const key = envToPokemonKey(p.env);
        const sprite = getSpriteForLabel(p.label);

        const files = [];
        const embed = {
          title: p.label,
          color: 0x1f2937
        };

        if (sprite) {
          embed.image = { url: `attachment://${sprite.name}` };
          files.push(sprite);
        }

        await channel.send({
          embeds: [embed],
          files,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`roles_manage_${process.env[p.env]}:on`)
                .setLabel('ON')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`roles_manage_${process.env[p.env]}:off`)
                .setLabel('OFF')
                .setStyle(ButtonStyle.Secondary)
            )
          ]
        });
      }
    }

    await interaction.editReply('✅ Role panel deployed successfully.');
  }
};

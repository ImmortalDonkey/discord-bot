/**
 * /roledeploy
 *
 * Deploys the Roamer Notification role panel.
 *
 * RULES (LOCKED):
 * - MAIN guild only (never global, never subscriber)
 * - Staff-only via STAFF_ROLES env
 * - Uses CHANNEL_ROLES env
 * - Uses LOCAL sprite files from /sprites (POKÉMON ONLY)
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
// LOCAL SPRITES (POKÉMON ONLY)
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

const normalize = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Resolve Pokémon sprite using LABEL as truth
 */
function getSpriteForLabel(label) {
  if (!label) return null;

  const exact = path.join(SPRITES_DIR, `${label}.png`);
  if (fs.existsSync(exact)) {
    return { attachment: exact, name: `${label}.png` };
  }

  const target = normalize(label);
  const files = fs.readdirSync(SPRITES_DIR);

  const found = files.find((f) =>
    normalize(path.basename(f, path.extname(f))) === target
  );

  return found
    ? { attachment: path.join(SPRITES_DIR, found), name: found }
    : null;
}

// ──────────────────────────────
// ORDER (LOCKED)
// ──────────────────────────────
const ORDERED_GROUPS = [
  'paradox',
  'roamerMonth',
  'legendary',
  'rare',
  'common'
];

// ──────────────────────────────
// RARITY GROUP → ENV KEY (TRUTH)
// ──────────────────────────────
const RARITY_ENV_BY_GROUP = {
  paradox: 'ROLE_PARADOX',
  roamerMonth: 'ROLE_ROAMERMONTH',
  legendary: 'ROLE_LEGENDARY',
  rare: 'ROLE_RARE',
  common: 'ROLE_COMMON'
};

// ──────────────────────────────
// COMMAND
// ──────────────────────────────
module.exports = {
  mainGuildOnly: true,

  data: new SlashCommandBuilder()
    .setName('roledeploy')
    .setDescription('Deploy the roamer notification role panel'),

  async execute(client, interaction) {
    // Staff check
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

    const channel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
    if (!channel) return interaction.editReply('❌ Role panel channel not found.');

    // Clear channel (best effort)
    try {
      const msgs = await channel.messages.fetch({ limit: 100 });
      if (msgs.size) await channel.bulkDelete(msgs, true).catch(() => {});
    } catch {}

    // ──────────────────────────────
    // INTRO + GLOBAL ACTIONS
    // ──────────────────────────────
    await channel.send({
      embeds: [{
        title: '🔔 Roamer Notification Preferences',
        color: 0xf59e0b,
        description: [
          'Use this channel to choose which roaming Pokémon notifications you want to receive.',
          '',
          '• Select **rarity groups** to get all Pokémon of that rarity',
          '• Select **individual Pokémon** for specific roamers only',
          '',
          'You can change your preferences at any time.'
        ].join('\n')
      }],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('role:view_status')
            .setLabel('View my notifications')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('role:clear_all')
            .setLabel('Clear all')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });

    // ──────────────────────────────
    // RARITY GROUPS (HEADER TEXT + BUTTONS) — MUST APPEAR BEFORE POKÉMON
    // ──────────────────────────────
    for (const group of ORDERED_GROUPS) {
      const envKey = RARITY_ENV_BY_GROUP[group];
      const rarity = rolesConfig.rarityRoles.find((r) => r.env === envKey);

      // If config missing, still show something obvious
      const label = rarity?.label || group;

      await channel.send({
        embeds: [{
          title: label,
          color: 0x64748b
        }],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`role:rarity:${group}:on`)
              .setLabel('ON')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`role:rarity:${group}:off`)
              .setLabel('OFF')
              .setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    }

    // ──────────────────────────────
    // INDIVIDUAL POKÉMON (AFTER RARITIES)
    // ──────────────────────────────
    for (const group of ORDERED_GROUPS) {
      const pokemon = rolesConfig.pokemonRoles.filter((p) => p.group === group);

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
                .setCustomId(`role:pokemon:${key}:on`)
                .setLabel('ON')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`role:pokemon:${key}:off`)
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
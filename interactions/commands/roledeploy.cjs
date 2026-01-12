/**
 * /roledeploy
 *
 * Deploys the Roamer Notification role panel.
 *
 * RULES (LOCKED):
 * - CommandHandler enforces MAIN vs SUBSCRIBER
 * - MAIN guild only (not allowlisted for subscribers)
 * - Staff-only via STAFF_ROLES env
 * - Uses CHANNEL_ROLES env
 * - Uses LOCAL sprite files from /sprites
 * - Always clears & redeploys entire panel
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
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

function getSpriteFileFromKey(pokemonKey) {
  const display = pokemonKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  const direct = path.join(SPRITES_DIR, `${display}.png`);
  if (fs.existsSync(direct)) {
    return {
      attachment: direct,
      name: `${display}.png`
    };
  }

  const files = fs.readdirSync(SPRITES_DIR);
  const found = files.find(f =>
    f.toLowerCase().includes(display.toLowerCase())
  );

  return found
    ? {
        attachment: path.join(SPRITES_DIR, found),
        name: found
      }
    : null;
}

// ──────────────────────────────
// RARITY GROUP IMAGES
// ──────────────────────────────
const RARITY_IMAGES = {
  paradox: '/home/pi/discord-bot/sprites/Walking Wake.png',
  roamerMonth: '/home/pi/discord-bot/sprites/Rayquaza (Illusion).png',
  legendary: '/home/pi/discord-bot/sprites/Entei.png',
  common: '/home/pi/discord-bot/sprites/Bombirdier.png'
};

// ──────────────────────────────
// COMMAND
// ──────────────────────────────
module.exports = {
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

    // Intro
    const intro = new EmbedBuilder()
      .setTitle('🔔 Roamer Notification Preferences')
      .setDescription(
        [
          'Use this channel to choose which roaming Pokémon notifications you want to receive.',
          '',
          '• Select **rarity groups** to get all Pokémon of that rarity',
          '• Select **individual Pokémon** for specific roamers only',
          '',
          'You can change your preferences at any time.'
        ].join('\n')
      )
      .setColor(0xf59e0b);

    await channel.send({
      embeds: [intro],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('role:clear_all')
            .setLabel('Clear all')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });

    // Rarity groups
    for (const r of rolesConfig.rarityRoles) {
      const rarityKey = r.env.replace(/^ROLE_/, '').toLowerCase();
      const imagePath = RARITY_IMAGES[rarityKey];

      const embed = new EmbedBuilder()
        .setTitle(r.label)
        .setColor(0x64748b);

      const files = [];

      if (imagePath && fs.existsSync(imagePath)) {
        const name = path.basename(imagePath);
        embed.setImage({ url: `attachment://${name}` });
        files.push({ attachment: imagePath, name });
      }

      await channel.send({
        embeds: [embed],
        files,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`role:rarity:${rarityKey}:on`)
              .setLabel('ON')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`role:rarity:${rarityKey}:off`)
              .setLabel('OFF')
              .setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    }

    // Individual Pokémon (3 per message)
    const orderedGroups = [
      'roamerMonth',
      'paradox',
      'legendary',
      'rare',
      'common'
    ];

    for (const group of orderedGroups) {
      const pokemon = rolesConfig.pokemonRoles.filter(p => p.group === group);

      for (let i = 0; i < pokemon.length; i += 3) {
        const chunk = pokemon.slice(i, i + 3);

        const embeds = [];
        const files = [];
        const rows = [];

        for (const p of chunk) {
          const key = envToPokemonKey(p.env);
          const file = getSpriteFileFromKey(key);

          const embed = new EmbedBuilder()
            .setTitle(p.label)
            .setColor(0x1f2937);

          if (file) {
            embed.setImage({ url: `attachment://${file.name}` });
            files.push(file);
          }

          embeds.push(embed);

          rows.push(
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
          );
        }

        await channel.send({ embeds, files, components: rows });
      }
    }

    await interaction.editReply('✅ Role panel deployed successfully.');
  }
};

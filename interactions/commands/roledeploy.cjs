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
// ENV (EXISTING KEYS)
// ──────────────────────────────
const PANEL_CHANNEL_ID = process.env.CHANNEL_ROLES;

const STAFF_ROLES = (process.env.STAFF_ROLES || '')
  .split(',')
  .map(r => r.trim())
  .filter(Boolean);

// ──────────────────────────────
// LOCAL SPRITES (PI)
// ──────────────────────────────
const SPRITES_DIR = path.join(__dirname, '..', '..', 'sprites');

// ──────────────────────────────
// DATA (INDIVIDUAL POKÉMON)
// ──────────────────────────────
const { getPokemonByRarity } =
  require('../../utils/roleData.cjs');

// ──────────────────────────────
// HELPERS
// ──────────────────────────────
function hasStaffRole(member) {
  return STAFF_ROLES.some(id => member.roles.cache.has(id));
}

function getSpritePathFromKey(pokemonKey) {
  if (!pokemonKey) return null;

  const display = pokemonKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  const direct = path.join(SPRITES_DIR, `${display}.png`);
  if (fs.existsSync(direct)) return direct;

  const files = fs.readdirSync(SPRITES_DIR);
  const found = files.find(f =>
    f.toLowerCase().includes(display.toLowerCase())
  );

  return found ? path.join(SPRITES_DIR, found) : null;
}

// ──────────────────────────────
// HARD-LOCKED RARITY GROUPS (WITH IMAGES)
// ──────────────────────────────
const RARITY_GROUPS = [
  {
    key: 'paradox',
    label: 'Paradox',
    imagePath: '/home/pi/discord-bot/sprites/Walking Wake.png'
  },
  {
    key: 'roamerMonth',
    label: 'Roamer of the Month',
    imagePath: '/home/pi/discord-bot/sprites/Rayquaza (Illusion).png'
  },
  {
    key: 'legendary',
    label: 'Legendary',
    imagePath: '/home/pi/discord-bot/sprites/Entei.png'
  },
  {
    key: 'common',
    label: 'Common',
    imagePath: '/home/pi/discord-bot/sprites/Bombirdier.png'
  }
];

// ──────────────────────────────
// COMMAND
// ──────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('roledeploy')
    .setDescription('Deploy the roamer notification role panel'),

  async execute(client, interaction) {
    // ──────────────────────────────
    // STAFF CHECK
    // ──────────────────────────────
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

    // ──────────────────────────────
    // CHANNEL
    // ──────────────────────────────
    const channel = await client.channels
      .fetch(PANEL_CHANNEL_ID)
      .catch(() => null);

    if (!channel) {
      return interaction.editReply('❌ Role panel channel not found.');
    }

    // ──────────────────────────────
    // CLEAR CHANNEL (BEST EFFORT)
    // ──────────────────────────────
    try {
      const msgs = await channel.messages.fetch({ limit: 100 });
      if (msgs.size) {
        await channel.bulkDelete(msgs, true).catch(() => {});
      }
    } catch {}

    // ──────────────────────────────
    // INTRO + CLEAR ALL
    // ──────────────────────────────
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

    const clearRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('role:clear_all')
        .setLabel('Clear all')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      embeds: [intro],
      components: [clearRow]
    });

    // ──────────────────────────────
    // RARITY GROUP PANELS (WITH IMAGES)
    // ──────────────────────────────
    for (const r of RARITY_GROUPS) {
      const embed = new EmbedBuilder()
        .setTitle(r.label)
        .setColor(0x64748b);

      const files = [];

      if (fs.existsSync(r.imagePath)) {
        embed.setImage(`attachment://${path.basename(r.imagePath)}`);
        files.push(r.imagePath);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`role:rarity:${r.key}:on`)
          .setLabel('ON')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`role:rarity:${r.key}:off`)
          .setLabel('OFF')
          .setStyle(ButtonStyle.Secondary)
      );

      await channel.send({
        embeds: [embed],
        files,
        components: [row]
      });
    }

    // ──────────────────────────────
    // INDIVIDUAL POKÉMON (3 PER MESSAGE)
    // ──────────────────────────────
    const orderedRarities = [
      'paradox',
      'roamerMonth',
      'legendary',
      'rare',
      'common'
    ];

    for (const rarity of orderedRarities) {
      const pokemon = await getPokemonByRarity(rarity);

      for (let i = 0; i < pokemon.length; i += 3) {
        const chunk = pokemon.slice(i, i + 3);

        const embeds = [];
        const files = [];
        const rows = [];

        for (const p of chunk) {
          const spritePath = getSpritePathFromKey(p.key);

          const embed = new EmbedBuilder()
            .setTitle(p.name)
            .setColor(0x1f2937);

          if (spritePath) {
            embed.setImage(`attachment://${path.basename(spritePath)}`);
            files.push(spritePath);
          }

          embeds.push(embed);

          rows.push(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`role:pokemon:${p.key}:on`)
                .setLabel('ON')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`role:pokemon:${p.key}:off`)
                .setLabel('OFF')
                .setStyle(ButtonStyle.Secondary)
            )
          );
        }

        await channel.send({
          embeds,
          files,
          components: rows
        });
      }
    }

    await interaction.editReply('✅ Role panel deployed successfully.');
  }
};

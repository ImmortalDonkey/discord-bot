/**
 * /roledeploy
 *
 * Deploys the Roamer Notification role panel.
 *
 * RULES:
 * - Admin only (Discord permission based)
 * - Channel specified at command usage
 * - Uses LOCAL sprite files from /sprites
 * - Always clears & redeploys entire panel
 */

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

const fs = require('fs');
const path = require('path');

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

  data: new SlashCommandBuilder()
    .setName('roledeploy')
    .setDescription('Deploy the roamer notification role panel')
    .addChannelOption(opt =>
      opt
        .setName('channel')
        .setDescription('Channel to deploy the role panel into')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(client, interaction) {
    const channel = interaction.options.getChannel('channel');

    await interaction.reply({
      content: `⏳ Deploying role panel to <#${channel.id}>…`,
      ephemeral: true
    });

    // Clear channel
    try {
      const msgs = await channel.messages.fetch({ limit: 100 });
      if (msgs.size) await channel.bulkDelete(msgs, true).catch(() => {});
    } catch {}

    // ──────────────────────────────
    // INTRO + GLOBAL ACTIONS (ORIGINAL TEXT RESTORED)
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
    // RARITY GROUPS
    // ──────────────────────────────
    for (const r of rolesConfig.rarityRoles) {
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
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });
    }

    // ──────────────────────────────
    // INDIVIDUAL POKÉMON
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
                .setStyle(ButtonStyle.Danger)
            )
          ]
        });
      }
    }

    await interaction.editReply('✅ Role panel deployed successfully.');
  }
};

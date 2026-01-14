/**
 * /roledeploy
 *
 * Deploys the Roamer Notification role panel.
 *
 * MAIN-9 VERIFIED FIX:
 * - Uses rolesButtons.cjs routing (roles_manage_ prefix)
 * - ON/OFF are unique per message using :on / :off suffix
 * - Adds global buttons: roles_view_status, roles_clear_all
 * - Rarity groups appear BEFORE Pokémon
 * - Rarity order: Paradox -> RoamerMonth -> Legendary -> Rare -> Common
 * - Pokémon are 1 per message (image + ON/OFF in same row)
 */

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const PANEL_CHANNEL_ID = process.env.CHANNEL_ROLES;

const STAFF_ROLES = (process.env.STAFF_ROLES || '')
  .split(',')
  .map(r => r.trim())
  .filter(Boolean);

const SPRITES_DIR = path.join(__dirname, '..', '..', 'sprites');
const rolesConfig = require('../../utils/rolesConfig.cjs');

function hasStaffRole(member) {
  return STAFF_ROLES.some(id => member.roles.cache.has(id));
}

const normalize = s =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function getSpriteForLabel(label) {
  if (!label) return null;

  // Exact filename match (matches your ls -1b truth)
  const exact = path.join(SPRITES_DIR, `${label}.png`);
  if (fs.existsSync(exact)) {
    return { attachment: exact, name: `${label}.png` };
  }

  // Normalized fallback
  const target = normalize(label);
  const files = fs.readdirSync(SPRITES_DIR);

  const found = files.find(f =>
    normalize(path.basename(f, path.extname(f))) === target
  );

  return found
    ? { attachment: path.join(SPRITES_DIR, found), name: found }
    : null;
}

// LOCKED order (your request)
const ORDERED_GROUPS = [
  'paradox',
  'roamerMonth',
  'legendary',
  'rare',
  'common'
];

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

    const channel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
    if (!channel) return interaction.editReply('❌ Role panel channel not found.');

    // Clear channel (best effort)
    try {
      const msgs = await channel.messages.fetch({ limit: 100 });
      if (msgs.size) await channel.bulkDelete(msgs, true).catch(() => {});
    } catch {}

    // Intro + global actions
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
    // RARITY GROUPS (header text + ON/OFF)
    // ──────────────────────────────
    for (const group of ORDERED_GROUPS) {
      // Map group -> rarity config entry
      const rarityEntry =
        group === 'roamerMonth'
          ? rolesConfig.rarityRoles.find(r => r.env === 'ROLE_ROAMERMONTH')
          : group === 'paradox'
            ? rolesConfig.rarityRoles.find(r => r.env === 'ROLE_PARADOX')
            : group === 'legendary'
              ? rolesConfig.rarityRoles.find(r => r.env === 'ROLE_LEGENDARY')
              : group === 'rare'
                ? rolesConfig.rarityRoles.find(r => r.env === 'ROLE_RARE')
                : rolesConfig.rarityRoles.find(r => r.env === 'ROLE_COMMON');

      if (!rarityEntry) continue;

      const roleId = process.env[rarityEntry.env];
      if (!roleId) continue;

      await channel.send({
        embeds: [{ title: rarityEntry.label, color: 0x64748b }],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`roles_manage_${roleId}:on`)
              .setLabel('ON')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`roles_manage_${roleId}:off`)
              .setLabel('OFF')
              .setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    }

    // ──────────────────────────────
    // INDIVIDUAL POKÉMON (1 per message)
    // ──────────────────────────────
    for (const group of ORDERED_GROUPS) {
      const pokemon = rolesConfig.pokemonRoles.filter(p => p.group === group);

      for (const p of pokemon) {
        const roleId = process.env[p.env];
        if (!roleId) continue;

        const sprite = getSpriteForLabel(p.label);

        const files = [];
        const embed = { title: p.label, color: 0x1f2937 };

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
                .setCustomId(`roles_manage_${roleId}:on`)
                .setLabel('ON')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`roles_manage_${roleId}:off`)
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

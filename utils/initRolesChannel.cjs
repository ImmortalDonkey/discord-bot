const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const db = require('../database.cjs');
const rolesConfig = require('./rolesConfig.cjs');

/**
 * Canonical group order (DO NOT CHANGE)
 * Applies to:
 * - Rarity Groups
 * - Individual Pokémon groups
 */
const GROUP_ORDER = [
  'paradox',
  'roamerMonth',
  'legendary',
  'rare',
  'common'
];

function groupLabel(key) {
  if (key === 'roamerMonth') return 'Roamer of the Month';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Initialise the #roles channel.
 * Order is STRICT and deterministic.
 */
async function initRolesChannel(client) {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

  const channel = guild.channels.cache.get(process.env.CHANNEL_ROLES);
  if (!channel) return;

  // ──────────────────────────────
  // 🧱 Ensure table exists
  // ──────────────────────────────
  await db.initRoleMessagesTable();
  console.log('🧱 role_messages table ensured');

  // ──────────────────────────────
  // 🔔 TOP DEBRIEF
  // ──────────────────────────────
  const DEBRIEF_KEY = '__ROLES_DEBRIEF__';
  if (!(await db.getRoleMessage(DEBRIEF_KEY))) {
    const msg = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔔 Roamer Notification Preferences')
          .setDescription(
            'Use this channel to choose which roaming Pokémon notifications you want to receive.\n\n' +
            '• Select **rarity groups** to be notified about all Pokémon of that rarity\n' +
            '• Select **individual Pokémon** to be notified about specific roamers only\n\n' +
            'You can change your preferences at any time.\n' +
            'Your current selections will always be reflected when you open a role panel.'
          )
      ]
    });

    await db.saveRoleMessage({
      roleId: DEBRIEF_KEY,
      messageId: msg.id,
      channelId: channel.id,
      roleType: 'debrief'
    });
  }

  // ──────────────────────────────
  // 📂 RARITY GROUPS HEADER
  // ──────────────────────────────
  const RARITY_HEADER_KEY = '__RARITY_GROUPS__';
  if (!(await db.getRoleMessage(RARITY_HEADER_KEY))) {
    const msg = await channel.send({
      embeds: [new EmbedBuilder().setTitle('Rarity Groups')]
    });

    await db.saveRoleMessage({
      roleId: RARITY_HEADER_KEY,
      messageId: msg.id,
      channelId: channel.id,
      roleType: 'category'
    });
  }

  // ──────────────────────────────
  // ⭐ RARITY GROUP ROLES (ORDERED)
  // ──────────────────────────────
  const rarityRolesSorted = [...rolesConfig.rarityRoles].sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.group) -
      GROUP_ORDER.indexOf(b.group)
  );

  for (const role of rarityRolesSorted) {
    const roleId = process.env[role.env];
    if (!roleId) continue;
    if (await db.getRoleMessage(roleId)) continue;

    const msg = await channel.send({
      content: `**${role.label}**`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`roles_manage_${roleId}`)
            .setLabel('Manage')
            .setStyle(ButtonStyle.Primary)
        )
      ]
    });

    await db.saveRoleMessage({
      roleId,
      messageId: msg.id,
      channelId: channel.id,
      roleType: 'rarity'
    });
  }

  // ──────────────────────────────
  // 📂 INDIVIDUAL POKÉMON HEADER
  // ──────────────────────────────
  const POKEMON_HEADER_KEY = '__INDIVIDUAL_POKEMON__';
  if (!(await db.getRoleMessage(POKEMON_HEADER_KEY))) {
    const msg = await channel.send({
      embeds: [new EmbedBuilder().setTitle('Individual Pokémon')]
    });

    await db.saveRoleMessage({
      roleId: POKEMON_HEADER_KEY,
      messageId: msg.id,
      channelId: channel.id,
      roleType: 'category'
    });
  }

  // ──────────────────────────────
  // 🧩 INDIVIDUAL POKÉMON (GROUPED + ORDERED)
  // ──────────────────────────────
  for (const group of GROUP_ORDER) {
    const groupKey = `__POKEMON_GROUP_${group.toUpperCase()}__`;

    if (!(await db.getRoleMessage(groupKey))) {
      const msg = await channel.send({
        content: `**${groupLabel(group)}**`
      });

      await db.saveRoleMessage({
        roleId: groupKey,
        messageId: msg.id,
        channelId: channel.id,
        roleType: 'pokemon-group'
      });
    }

    const pokemons = rolesConfig.pokemonRoles.filter(
      r => r.group === group
    );

    for (const role of pokemons) {
      const roleId = process.env[role.env];
      if (!roleId) continue;
      if (await db.getRoleMessage(roleId)) continue;

      const msg = await channel.send({
        content: role.label,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`roles_manage_${roleId}`)
              .setLabel('Manage')
              .setStyle(ButtonStyle.Secondary)
          )
        ]
      });

      await db.saveRoleMessage({
        roleId,
        messageId: msg.id,
        channelId: channel.id,
        roleType: 'pokemon'
      });
    }
  }

  console.log('🎉 Roles channel fully initialised');
}

module.exports = { initRolesChannel };

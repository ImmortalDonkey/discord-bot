const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const db = require('../database.cjs');
const rolesConfig = require('./rolesConfig.cjs');

/**
 * Initialise the #roles channel.
 * - Posts a single top debrief message
 * - Posts category headers
 * - Posts one persistent message per role
 * - Uses DB persistence to avoid reposting on restart
 */
async function initRolesChannel(client) {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) {
    console.warn('⚠️ initRolesChannel: Guild not found');
    return;
  }

  const channel = guild.channels.cache.get(process.env.CHANNEL_ROLES);
  if (!channel) {
    console.warn('⚠️ initRolesChannel: CHANNEL_ROLES not found');
    return;
  }

  // ──────────────────────────────
  // 🔔 TOP DEBRIEF MESSAGE
  // ──────────────────────────────
  const DEBRIEF_KEY = '__ROLES_DEBRIEF__';

  const existingDebrief = await db.getRoleMessage(DEBRIEF_KEY);
  if (!existingDebrief) {
    const embed = new EmbedBuilder()
      .setTitle('🔔 Roamer Notification Preferences')
      .setDescription(
        'Use this channel to choose which roaming Pokémon notifications you want to receive.\n\n' +
        '• Select **rarity groups** to be notified about all Pokémon of that rarity\n' +
        '• Select **individual Pokémon** to be notified about specific roamers only\n\n' +
        'You can change your preferences at any time.\n' +
        'Your current selections will always be reflected when you open a role panel.'
      );

    const msg = await channel.send({ embeds: [embed] });

    await db.saveRoleMessage({
      roleId: DEBRIEF_KEY,
      messageId: msg.id,
      channelId: channel.id,
      roleType: 'debrief'
    });

    console.log('✅ Roles debrief message posted');
  }

  // ──────────────────────────────
  // 📂 CATEGORY HEADERS
  // ──────────────────────────────
  const categories = [
    { key: '__RARITY_GROUPS__', title: 'Rarity Groups' },
    { key: '__INDIVIDUAL_POKEMON__', title: 'Individual Pokémon' }
  ];

  for (const cat of categories) {
    const existing = await db.getRoleMessage(cat.key);
    if (existing) continue;

    const msg = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(cat.title)
          .setColor(0x5865F2)
      ]
    });

    await db.saveRoleMessage({
      roleId: cat.key,
      messageId: msg.id,
      channelId: channel.id,
      roleType: 'category'
    });

    console.log(`✅ Category posted: ${cat.title}`);
  }

  // ──────────────────────────────
  // ⭐ RARITY GROUP ROLES
  // ──────────────────────────────
  for (const role of rolesConfig.rarityRoles) {
    const roleId = process.env[role.env];
    if (!roleId) {
      console.warn(`⚠️ Missing env for rarity role: ${role.env}`);
      continue;
    }

    const existing = await db.getRoleMessage(roleId);
    if (existing) continue;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`roles_manage:${roleId}`)
        .setLabel('Manage')
        .setStyle(ButtonStyle.Primary)
    );

    const msg = await channel.send({
      content: `**${role.label}**`,
      components: [row]
    });

    await db.saveRoleMessage({
      roleId,
      messageId: msg.id,
      channelId: channel.id,
      roleType: 'rarity'
    });

    console.log(`✅ Rarity role posted: ${role.label}`);
  }

  // ──────────────────────────────
  // 🧩 INDIVIDUAL POKÉMON ROLES
  // (grouped by rarity section)
  // ──────────────────────────────
  let currentGroup = null;

  for (const role of rolesConfig.pokemonRoles) {
    const roleId = process.env[role.env];
    if (!roleId) {
      console.warn(`⚠️ Missing env for Pokémon role: ${role.env}`);
      continue;
    }

    // Group header (once per group)
    if (role.group !== currentGroup) {
      const headerKey = `__POKEMON_GROUP_${role.group.toUpperCase()}__`;
      const existingHeader = await db.getRoleMessage(headerKey);

      if (!existingHeader) {
        const msg = await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(role.group.replace(/([A-Z])/g, ' $1').trim())
              .setColor(0x2B2D31)
          ]
        });

        await db.saveRoleMessage({
          roleId: headerKey,
          messageId: msg.id,
          channelId: channel.id,
          roleType: 'pokemon-group'
        });

        console.log(`✅ Pokémon group header posted: ${role.group}`);
      }

      currentGroup = role.group;
    }

    // Individual Pokémon role message
    const existing = await db.getRoleMessage(roleId);
    if (existing) continue;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`roles_manage:${roleId}`)
        .setLabel('Manage')
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await channel.send({
      content: `**${role.label}**`,
      components: [row]
    });

    await db.saveRoleMessage({
      roleId,
      messageId: msg.id,
      channelId: channel.id,
      roleType: 'pokemon'
    });

    console.log(`✅ Pokémon role posted: ${role.label}`);
  }

  console.log('🎉 Roles channel initialised successfully');
}

module.exports = { initRolesChannel };

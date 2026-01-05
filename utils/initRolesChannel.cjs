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
 * - Creates DB table if missing (DEV SAFE)
 * - Posts top debrief
 * - Posts category headers
 * - Posts rarity group role toggles
 * - Posts individual Pokémon role toggles (grouped)
 * - Uses DB persistence to avoid reposting
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

  // ──────────────────────────────────────
  // 🧱 ENSURE TABLE EXISTS (DEV DB FIX)
  // ──────────────────────────────────────
  await db.initRoleMessagesTable();

  console.log('🧱 role_messages table ensured');

  // ──────────────────────────────────────
  // 🔔 TOP DEBRIEF MESSAGE
  // ──────────────────────────────────────
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

    console.log('✅ Roles debrief posted');
  }

  // ──────────────────────────────────────
  // 📂 CATEGORY HEADERS
  // ──────────────────────────────────────
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

  // ──────────────────────────────────────
  // ⭐ RARITY GROUP ROLES
  // ──────────────────────────────────────
  for (const role of rolesConfig.rarityRoles) {
    /**
     * IMPORTANT:
     * Env is kept EXACTLY as your live env:
     * ROLE_ROAMERMONTH (NO underscore)
     */
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

  // ──────────────────────────────────────
  // 🧩 INDIVIDUAL POKÉMON ROLES (GROUPED)
  // ──────────────────────────────────────
  let currentGroup = null;

  for (const role of rolesConfig.pokemonRoles) {
    const roleId = process.env[role.env];
    if (!roleId) {
      console.warn(`⚠️ Missing env for Pokémon role: ${role.env}`);
      continue;
    }

    // ── Group header ──
    if (role.group !== currentGroup) {
      const headerKey = `__POKEMON_GROUP_${role.group.toUpperCase()}__`;
      const existingHeader = await db.getRoleMessage(headerKey);

      if (!existingHeader) {
        const title =
          role.group === 'roamerMonth'
            ? 'Roamer of the Month'
            : role.group.charAt(0).toUpperCase() + role.group.slice(1);

        const msg = await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(title)
              .setColor(0x2B2D31)
          ]
        });

        await db.saveRoleMessage({
          roleId: headerKey,
          messageId: msg.id,
          channelId: channel.id,
          roleType: 'pokemon-group'
        });

        console.log(`✅ Pokémon group header posted: ${title}`);
      }

      currentGroup = role.group;
    }

    // ── Individual Pokémon toggle ──
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

  console.log('🎉 Roles channel fully initialised');
}

module.exports = { initRolesChannel };

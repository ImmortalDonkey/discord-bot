// interactions/commands/roledeploy.cjs

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
const db = require('../../database.cjs');
const rolesConfig = require('../../utils/rolesConfig.cjs');
const { availableLocations } = require('../../utils/locations.cjs');

const SPRITES_DIR = path.join(__dirname, '..', '..', 'sprites');

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

// Map env → DB rarity_key
function rarityEnvToDbKey(env) {
  const e = String(env || '').toUpperCase();
  if (e === 'ROLE_PARADOX') return 'paradox';
  if (e === 'ROLE_ROAMERMONTH') return 'roamer_month';
  if (e === 'ROLE_LEGENDARY') return 'legendary';
  if (e === 'ROLE_RARE') return 'rare';
  if (e === 'ROLE_COMMON') return 'common';
  return null;
}

// Label → DB pokemon_key
function labelToDbPokemonKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[()']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

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
    .addBooleanOption(opt =>
      opt
        .setName('create-route-roles')
        .setDescription('Create Discord roles for all 30 locations and store them in DB')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(client, interaction) {
    const channel = interaction.options.getChannel('channel');
    const guild = interaction.guild;
    const createRouteRoles = interaction.options.getBoolean('create-route-roles') ?? false;

    await interaction.reply({
      content: `⏳ Deploying role panel to <#${channel.id}>…`,
      flags: 64
    });

    // ──────────────────────────────
    // ROUTE ROLES CREATION (optional)
    // ──────────────────────────────
    if (createRouteRoles) {
      await interaction.editReply('⏳ Creating route roles…');
      let created = 0;
      for (const location of availableLocations) {
        try {
          const existing = await db.getGuildRouteRole(guild.id, location);
          if (existing) continue;

          const role = await guild.roles.create({
            name: location,
            mentionable: true,
            reason: 'Route role created by /roledeploy'
          });

          await db.upsertGuildRouteRole({ guildId: guild.id, location, roleId: role.id });
          created++;
        } catch (err) {
          console.error(`[roledeploy] failed to create route role for "${location}":`, err);
        }
      }
      await interaction.editReply(`✅ Route roles created (${created} new). Deploying panel…`);
    }

    // Clear channel
    try {
      const msgs = await channel.messages.fetch({ limit: 100 });
      if (msgs.size) await channel.bulkDelete(msgs, true).catch(() => {});
    } catch {}

    const isMain = guild.id === process.env.GUILD_ID;

    // ──────────────────────────────
    // INTRO
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
    // RARITY GROUPS (ORDER FIXED)
    // ──────────────────────────────

    const orderedRarityEnvs = [
      'ROLE_PARADOX',
      'ROLE_ROAMERMONTH',
      'ROLE_LEGENDARY',
      'ROLE_RARE',
      'ROLE_COMMON'
    ];

    let rarityRoleIdByKey = new Map();

    if (!isMain) {
      const rows = await db.getGuildRarityRoles(guild.id);
      rarityRoleIdByKey = new Map(rows.map(r => [r.rarity_key, r.role_id]));
    }

    for (const envName of orderedRarityEnvs) {
      const r = rolesConfig.rarityRoles.find(x => x.env === envName);
      if (!r) continue;

      const roleId = isMain
        ? process.env[r.env]
        : rarityRoleIdByKey.get(rarityEnvToDbKey(r.env));

      if (!roleId) continue;

      await channel.send({
        embeds: [{
          title: r.label,
          color: 0x64748b
        }],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`roles_manage_${roleId}:on`)
              .setLabel('ON')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`roles_manage_${roleId}:off`)
              .setLabel('OFF')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });
    }

    // ──────────────────────────────
    // INDIVIDUAL POKÉMON (UNCHANGED ORDER)
    // ──────────────────────────────

    const orderedGroups = [
      'paradox',
      'roamerMonth',
      'legendary',
      'rare',
      'common'
    ];

    let pokemonRoleIdByKey = new Map();

    if (!isMain) {
      const rows = await db.getGuildPokemonRoles(guild.id);
      pokemonRoleIdByKey = new Map(rows.map(r => [r.pokemon_key, r.role_id]));
    }

    for (const group of orderedGroups) {
      const pokemon = rolesConfig.pokemonRoles.filter(p => p.group === group);

      for (const p of pokemon) {
        const roleId = isMain
          ? process.env[p.env]
          : pokemonRoleIdByKey.get(labelToDbPokemonKey(p.label));

        if (!roleId) continue;

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
                .setCustomId(`roles_manage_${roleId}:on`)
                .setLabel('ON')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`roles_manage_${roleId}:off`)
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

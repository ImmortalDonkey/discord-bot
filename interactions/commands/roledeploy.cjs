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
    const guild = interaction.guild;

    await interaction.reply({
      content: `⏳ Deploying role panel to <#${channel.id}>…`,
      flags: 64
    });

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
          '• **ON / OFF** — turn notifications on or off',
          '• **View my notifications** — shows your current selections',
          '• **Clear all** — removes all notification roles',
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
    // RARITY GROUPS
    // ──────────────────────────────
    let rarityMappings = [];

    if (isMain) {
      rarityMappings = rolesConfig.rarityRoles.map(r => ({
        label: r.label,
        roleId: process.env[r.env]
      }));
    } else {
      const rows = await db.getGuildRarityRoles(guild.id);

      rarityMappings = rows.map(row => {
        const config = rolesConfig.rarityRoles.find(
          r =>
            r.key === row.rarity_key ||
            r.env.toLowerCase().includes(row.rarity_key)
        );

        return {
          label: config ? config.label : row.rarity_key,
          roleId: row.role_id
        };
      });
    }

    for (const r of rarityMappings) {
      if (!r.roleId) continue;

      await channel.send({
        embeds: [{
          title: r.label,
          color: 0x64748b
        }],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`roles_manage_${r.roleId}:on`)
              .setLabel('ON')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`roles_manage_${r.roleId}:off`)
              .setLabel('OFF')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });
    }

    // ──────────────────────────────
    // POKÉMON
    // ──────────────────────────────
    let pokemonMappings = [];

    if (isMain) {
      pokemonMappings = rolesConfig.pokemonRoles.map(p => ({
        label: p.label,
        roleId: process.env[p.env]
      }));
    } else {
      const rows = await db.getGuildPokemonRoles(guild.id);

      pokemonMappings = rows.map(row => {
        const config = rolesConfig.pokemonRoles.find(
          p =>
            p.key === row.pokemon_key ||
            p.env.toLowerCase().endsWith(row.pokemon_key)
        );

        return {
          label: config ? config.label : row.pokemon_key,
          roleId: row.role_id
        };
      });
    }

    for (const p of pokemonMappings) {
      if (!p.roleId) continue;

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
              .setCustomId(`roles_manage_${p.roleId}:on`)
              .setLabel('ON')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`roles_manage_${p.roleId}:off`)
              .setLabel('OFF')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });
    }

    await interaction.editReply('✅ Role panel deployed successfully.');
  }
};

const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const db = require('../../database.cjs');

// must match dispatcher
function normalizeDbKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[()']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const VALID_RARITIES = new Set([
  'paradox',
  'roamer_month',
  'legendary',
  'rare',
  'common'
]);

module.exports = {
  subscriberSafe: true,

  data: new SlashCommandBuilder()
    .setName('reportrole')
    .setDescription('Map report rarity or Pokémon to a role')
    .addStringOption(opt =>
      opt
        .setName('type')
        .setDescription('Mapping type')
        .setRequired(true)
        .addChoices(
          { name: 'rarity', value: 'rarity' },
          { name: 'pokemon', value: 'pokemon' }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('id')
        .setDescription('Rarity key or Pokémon name')
        .setRequired(true)
    )
    .addRoleOption(opt =>
      opt
        .setName('role')
        .setDescription('Role to ping')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(client, interaction) {
    const { guild } = interaction;

    if (!guild) {
      return interaction.reply({
        content: '❌ Guild context missing.',
        ephemeral: true
      });
    }

    // 🔥 CRITICAL FIX: acknowledge interaction immediately
    await interaction.deferReply({ ephemeral: true });

    const type = interaction.options.getString('type');
    const rawId = interaction.options.getString('id');
    const role = interaction.options.getRole('role');

    // role hierarchy safety
    if (role.managed) {
      return interaction.editReply({
        content: '❌ Managed roles cannot be used.'
      });
    }

    if (role.position >= guild.members.me.roles.highest.position) {
      return interaction.editReply({
        content: '❌ Role is above the bot’s highest role.'
      });
    }

    try {
      if (type === 'rarity') {
        const rarityKey = normalizeDbKey(rawId);

        if (!VALID_RARITIES.has(rarityKey)) {
          return interaction.editReply({
            content: `❌ Invalid rarity key: \`${rarityKey}\``
          });
        }

        await db.upsertGuildRarityRole({
          guildId: guild.id,
          rarityKey,
          roleId: role.id,
          enabled: 1
        });

        return interaction.editReply({
          content:
            `✅ Rarity role mapped\n` +
            `**Rarity:** ${rarityKey}\n` +
            `**Role:** <@&${role.id}>`
        });
      }

      if (type === 'pokemon') {
        const pokemonKey = normalizeDbKey(rawId);

        if (!pokemonKey) {
          return interaction.editReply({
            content: '❌ Invalid Pokémon identifier.'
          });
        }

        await db.upsertGuildPokemonRole({
          guildId: guild.id,
          pokemonKey,
          roleId: role.id,
          enabled: 1
        });

        return interaction.editReply({
          content:
            `✅ Pokémon role mapped\n` +
            `**Pokémon key:** ${pokemonKey}\n` +
            `**Role:** <@&${role.id}>`
        });
      }

      return interaction.editReply({
        content: '❌ Unknown mapping type.'
      });

    } catch (err) {
      console.error('reportrole error:', err);
      return interaction.editReply({
        content: '❌ Failed to save role mapping.'
      });
    }
  }
};

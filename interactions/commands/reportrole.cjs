const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const db = require('../../database.cjs');
const rolesConfig = require('../../utils/rolesConfig.cjs');

// must match dispatcher
function normalizeDbKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[()']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const VALID_RARITIES = [
  'paradox',
  'roamer_month',
  'legendary',
  'rare',
  'common'
];

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
        .setDescription('Select rarity or Pokémon')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addRoleOption(opt =>
      opt
        .setName('role')
        .setDescription('Role to ping')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  // ──────────────────────────────
  // AUTOCOMPLETE HANDLER
  // ──────────────────────────────
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const type = interaction.options.getString('type');

    if (focused.name !== 'id') return;

    let choices = [];

    if (type === 'rarity') {
      choices = VALID_RARITIES.map(r => ({
        name: r,
        value: r
      }));
    }

    if (type === 'pokemon') {
      choices = rolesConfig.pokemonRoles.map(p => ({
        name: p.label,
        value: normalizeDbKey(p.label)
      }));
    }

    const filtered = choices
      .filter(c =>
        c.name.toLowerCase().includes(focused.value.toLowerCase())
      )
      .slice(0, 25); // Discord limit

    await interaction.respond(filtered);
  },

  // ──────────────────────────────
  // EXECUTE
  // ──────────────────────────────
  async execute(client, interaction) {
    const { guild } = interaction;

    if (!guild) {
      return interaction.reply({
        content: '❌ Guild context missing.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const type = interaction.options.getString('type');
    const rawId = interaction.options.getString('id');
    const role = interaction.options.getRole('role');

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

        if (!VALID_RARITIES.includes(rarityKey)) {
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

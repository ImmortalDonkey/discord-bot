const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const rolesConfig = require('../../utils/rolesConfig.cjs');

module.exports = {
  ids: ['roles_manage'],

  async execute(client, interaction) {
    const member = interaction.member;
    if (!member) {
      return interaction.reply({
        content: '❌ Member not found.',
        ephemeral: true
      });
    }

    const roleId = interaction.customId.split(':')[1];
    if (!roleId) {
      return interaction.reply({
        content: '❌ Invalid role.',
        ephemeral: true
      });
    }

    const guild = interaction.guild;
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return interaction.reply({
        content: '❌ Role no longer exists.',
        ephemeral: true
      });
    }

    // ──────────────────────────────
    // Detect rarity group role
    // ──────────────────────────────
    const rarityGroup = rolesConfig.rarityRoles.find(r => {
      const envId = process.env[r.env];
      return envId === roleId;
    });

    let rolesToToggle = [roleId];

    // ──────────────────────────────
    // If rarity group → toggle all Pokémon in group
    // ──────────────────────────────
    if (rarityGroup) {
      const groupKey =
        rarityGroup.label === 'Roamer of the Month'
          ? 'roamerMonth'
          : rarityGroup.label.toLowerCase();

      const pokemonRoles = rolesConfig.pokemonRoles
        .filter(p => p.group === groupKey)
        .map(p => process.env[p.env])
        .filter(Boolean);

      rolesToToggle = [roleId, ...pokemonRoles];
    }

    // ──────────────────────────────
    // Determine current state
    // ──────────────────────────────
    const hasAny = rolesToToggle.some(rid =>
      member.roles.cache.has(rid)
    );

    // ──────────────────────────────
    // Toggle roles
    // ──────────────────────────────
    try {
      if (hasAny) {
        await member.roles.remove(rolesToToggle);
      } else {
        await member.roles.add(rolesToToggle);
      }
    } catch (err) {
      console.error('❌ Role toggle failed:', err);
      return interaction.reply({
        content: '❌ Failed to update roles. Please try again.',
        ephemeral: true
      });
    }

    // ──────────────────────────────
    // Update button visual state
    // ──────────────────────────────
    const updatedButton = new ButtonBuilder()
      .setCustomId(interaction.customId)
      .setLabel('Manage')
      .setStyle(hasAny ? ButtonStyle.Secondary : ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(updatedButton);

    await interaction.update({
      components: [row]
    });

    await interaction.followUp({
      content: hasAny
        ? `🔕 **${role.name} notifications disabled**`
        : `🔔 **${role.name} notifications enabled**`,
      ephemeral: true
    });
  }
};

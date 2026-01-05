// interactions/buttons/rolesButtons.cjs

const { ButtonStyle } = require('discord.js');
const rolesConfig = require('../../utils/rolesConfig.cjs');

module.exports = {
  // IMPORTANT: must end with "_" to trigger prefix matching
  ids: ['roles_manage_'],

  async execute(client, interaction) {
    const member = interaction.member;
    if (!member) return;

    // Extract role ID from customId: roles_manage_<ROLE_ID>
    const roleId = interaction.customId.replace('roles_manage_', '');

    const guild = interaction.guild;
    if (!guild) return;

    const role = guild.roles.cache.get(roleId);
    if (!role) {
      await interaction.reply({
        content: '❌ This role no longer exists.',
        ephemeral: true
      });
      return;
    }

    const hasRole = member.roles.cache.has(roleId);

    // ──────────────────────────────
    // 🧠 Is this a rarity group?
    // ──────────────────────────────
    const rarityEntry = rolesConfig.rarityRoles.find(r =>
      process.env[r.env] === roleId
    );

    // ──────────────────────────────
    // ⭐ RARITY GROUP TOGGLE
    // ──────────────────────────────
    if (rarityEntry) {
      const groupKey = rarityEntry.label
        .toLowerCase()
        .replace(/[^a-z]/g, '');

      const pokemonInGroup = rolesConfig.pokemonRoles.filter(p =>
        p.group.toLowerCase().replace(/[^a-z]/g, '') === groupKey
      );

      if (hasRole) {
        // Remove rarity + all Pokémon in group
        await member.roles.remove(roleId);

        for (const poke of pokemonInGroup) {
          const pokeRoleId = process.env[poke.env];
          if (pokeRoleId && member.roles.cache.has(pokeRoleId)) {
            await member.roles.remove(pokeRoleId);
          }
        }

        await interaction.reply({
          content: `❌ **${rarityEntry.label}** notifications disabled.`,
          ephemeral: true
        });
      } else {
        // Add rarity + all Pokémon in group
        await member.roles.add(roleId);

        for (const poke of pokemonInGroup) {
          const pokeRoleId = process.env[poke.env];
          if (pokeRoleId && !member.roles.cache.has(pokeRoleId)) {
            await member.roles.add(pokeRoleId);
          }
        }

        await interaction.reply({
          content: `✅ **${rarityEntry.label}** notifications enabled.`,
          ephemeral: true
        });
      }
    }

    // ──────────────────────────────
    // 🧩 INDIVIDUAL POKÉMON TOGGLE
    // ──────────────────────────────
    else {
      if (hasRole) {
        await member.roles.remove(roleId);
        await interaction.reply({
          content: `❌ **${role.name}** notifications disabled.`,
          ephemeral: true
        });
      } else {
        await member.roles.add(roleId);
        await interaction.reply({
          content: `✅ **${role.name}** notifications enabled.`,
          ephemeral: true
        });
      }
    }

    // ──────────────────────────────
    // 🎨 Update button style
    // ──────────────────────────────
    try {
      const row = interaction.message.components[0];
      const button = row.components[0];

      button.setStyle(
        member.roles.cache.has(roleId)
          ? ButtonStyle.Success
          : ButtonStyle.Secondary
      );

      await interaction.message.edit({ components: [row] });
    } catch {
      // Non-fatal (message may be old or locked)
    }
  }
};

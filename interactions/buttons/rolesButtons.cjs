// interactions/buttons/rolesButtons.cjs

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const rolesConfig = require('../../utils/rolesConfig.cjs');

module.exports = {
  // PREFIX MATCH — required
  ids: ['roles_manage_'],

  async execute(client, interaction) {
    const member = interaction.member;
    const guild = interaction.guild;

    if (!member || !guild) return;

    // roles_manage:<ROLE_ID>
    const roleId = interaction.customId.replace('roles_manage:', '');
    const role = guild.roles.cache.get(roleId);

    if (!role) return;

    const hasRole = member.roles.cache.has(roleId);

    // ──────────────────────────────
    // 🧠 Check if this is a rarity group
    // ──────────────────────────────
    const rarityEntry = rolesConfig.rarityRoles.find(
      r => process.env[r.env] === roleId
    );

    // ──────────────────────────────
    // ⭐ RARITY GROUP TOGGLE
    // ──────────────────────────────
    if (rarityEntry) {
      const groupKey = rarityEntry.group;

      const pokemonInGroup = rolesConfig.pokemonRoles.filter(
        p => p.group === groupKey
      );

      if (hasRole) {
        // Remove rarity + all Pokémon roles
        await member.roles.remove(roleId);

        for (const poke of pokemonInGroup) {
          const pokeRoleId = process.env[poke.env];
          if (pokeRoleId && member.roles.cache.has(pokeRoleId)) {
            await member.roles.remove(pokeRoleId);
          }
        }
      } else {
        // Add rarity + all Pokémon roles
        await member.roles.add(roleId);

        for (const poke of pokemonInGroup) {
          const pokeRoleId = process.env[poke.env];
          if (pokeRoleId && !member.roles.cache.has(pokeRoleId)) {
            await member.roles.add(pokeRoleId);
          }
        }
      }
    }

    // ──────────────────────────────
    // 🧩 INDIVIDUAL POKÉMON TOGGLE
    // ──────────────────────────────
    else {
      if (hasRole) {
        await member.roles.remove(roleId);
      } else {
        await member.roles.add(roleId);
      }
    }

    // ──────────────────────────────
    // 🎨 UPDATE BUTTON COLOUR (v14 SAFE)
    // ──────────────────────────────
    try {
      const oldRow = interaction.message.components[0];
      if (!oldRow) return;

      const oldButton = oldRow.components[0];
      if (!oldButton) return;

      const nowHasRole = member.roles.cache.has(roleId);

      const newButton = ButtonBuilder.from(oldButton).setStyle(
        nowHasRole
          ? ButtonStyle.Success   // 🟢 ON
          : ButtonStyle.Secondary // ⚫ OFF
      );

      const newRow = ActionRowBuilder.from(oldRow).setComponents(newButton);

      await interaction.message.edit({
        components: [newRow]
      });
    } catch {
      // Non-fatal: message may be old, deleted, or locked
    }
  }
};

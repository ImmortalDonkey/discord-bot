// interactions/buttons/rolesButtons.cjs

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const rolesConfig = require('../../utils/rolesConfig.cjs');

module.exports = {
  // PREFIX MATCH — REQUIRED
  ids: ['roles_manage_'],

  async execute(client, interaction) {
    // Always ACK immediately (no UI error, no ephemeral spam)
    await interaction.deferUpdate();

    const member = interaction.member;
    const guild = interaction.guild;
    if (!member || !guild) return;

    // Extract role ID
    const roleId = interaction.customId.replace('roles_manage_', '');
    const role = guild.roles.cache.get(roleId);
    if (!role) return;

    const hasRole = member.roles.cache.has(roleId);

    // ──────────────────────────────
    // 🧠 Detect rarity group
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
        // Remove rarity role
        await member.roles.remove(roleId);

        // Remove all Pokémon roles in that group
        for (const poke of pokemonInGroup) {
          const pokeRoleId = process.env[poke.env];
          if (pokeRoleId && member.roles.cache.has(pokeRoleId)) {
            await member.roles.remove(pokeRoleId);
          }
        }
      } else {
        // Add rarity role
        await member.roles.add(roleId);

        // Add all Pokémon roles in that group
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
    // 🎨 REBUILD BUTTON (SAFE WAY)
    // ──────────────────────────────
    const oldRow = interaction.message.components[0];
    if (!oldRow) return;

    const newRow = new ActionRowBuilder();

    for (const component of oldRow.components) {
      const newButton = ButtonBuilder.from(component);

      if (component.customId === interaction.customId) {
        newButton.setStyle(
          hasRole ? ButtonStyle.Secondary : ButtonStyle.Success
        );
      }

      newRow.addComponents(newButton);
    }

    await interaction.message.edit({
      components: [newRow]
    });
  }
};

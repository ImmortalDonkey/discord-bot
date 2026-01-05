// interactions/buttons/rolesButtons.cjs

const { ButtonStyle } = require('discord.js');
const rolesConfig = require('../../utils/rolesConfig.cjs');

module.exports = {
  // IMPORTANT: must end with "_" to trigger prefix matching
  ids: ['roles_manage_'],

  async execute(client, interaction) {
    const member = interaction.member;
    if (!member) return;

    // Acknowledge silently (no ephemeral message)
    await interaction.deferUpdate().catch(() => {});

    // Extract role ID from:
    // roles_manage_<ROLE_ID>  OR legacy roles_manage:<ROLE_ID>
    const roleId = interaction.customId
      .replace('roles_manage_', '')
      .replace('roles_manage:', '');

    const guild = interaction.guild;
    if (!guild) return;

    const role = guild.roles.cache.get(roleId);
    if (!role) return;

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
      const groupKey = rarityEntry.group;

      const pokemonInGroup = rolesConfig.pokemonRoles.filter(
        p => p.group === groupKey
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
      } else {
        // Add rarity + all Pokémon in group
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
    // 🎨 Update button style (ON / OFF)
    // ──────────────────────────────
    try {
      const row = interaction.message.components[0];
      const button = row.components[0];

      const nowHasRole = member.roles.cache.has(roleId);

      button.setStyle(
        nowHasRole
          ? ButtonStyle.Success   // 🟢 ON
          : ButtonStyle.Secondary // ⚫ OFF
      );

      await interaction.message.edit({
        components: [row]
      });
    } catch {
      // Non-fatal (message may be old, locked, or deleted)
    }
  }
};

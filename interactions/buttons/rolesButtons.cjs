// interactions/buttons/rolesButtons.cjs

const rolesConfig = require('../../utils/rolesConfig.cjs');

function parseManageCustomId(customId) {
  const raw = customId.replace('roles_manage_', '');
  const [roleId, mode] = raw.split(':');
  return { roleId, mode: mode || null };
}

module.exports = {
  ids: ['roles_manage_', 'roles_clear_all', 'roles_view_status'],

  async execute(client, interaction) {
    const { customId } = interaction;
    const member = interaction.member;
    const guild = interaction.guild;

    if (!member || !guild) return;

    // ──────────────────────────────
    // 👁 VIEW MY NOTIFICATIONS
    // ──────────────────────────────
    if (customId === 'roles_view_status') {
      const lines = [];

      lines.push('**Your Active Roles**');
      for (const role of member.roles.cache.values()) {
        if (role.name !== '@everyone') {
          lines.push(`• ${role.name}`);
        }
      }

      return interaction.reply({
        content: lines.length > 1 ? lines.join('\n') : '🔕 No notification roles selected.',
        flags: 64
      }).catch(err => {
        console.error('View status error:', err);
      });
    }

    // ──────────────────────────────
    // 🧹 CLEAR ALL
    // ──────────────────────────────
    if (customId === 'roles_clear_all') {
      await interaction.deferReply({ flags: 64 }).catch(() => {});

      const toRemove = [];

      for (const role of member.roles.cache.values()) {
        if (
          rolesConfig.rarityRoles.some(r => r.label === role.name) ||
          rolesConfig.pokemonRoles.some(p => p.label === role.name)
        ) {
          toRemove.push(role.id);
        }
      }

      if (toRemove.length) {
        try {
          await member.roles.remove(toRemove);
        } catch (err) {
          console.error('Clear all roles error:', err);
        }
      }

      return interaction.editReply({
        content: '✅ Cleared all rarity and Pokémon notification roles.'
      }).catch(err => {
        console.error('Edit reply error:', err);
      });
    }

    // ──────────────────────────────
    // 🔘 ROLE MANAGE (ON / OFF)
    // ──────────────────────────────
    if (customId.startsWith('roles_manage_')) {
      await interaction.deferUpdate().catch(() => {});

      const { roleId, mode } = parseManageCustomId(customId);
      if (!roleId) return;

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        console.error('Role not found:', roleId);
        return;
      }

      const hasRole = member.roles.cache.has(roleId);

      let targetOn;
      if (mode === 'on') targetOn = true;
      else if (mode === 'off') targetOn = false;
      else targetOn = !hasRole;

      try {
        if (targetOn && !hasRole) {
          await member.roles.add(roleId);
        } else if (!targetOn && hasRole) {
          await member.roles.remove(roleId);
        }
      } catch (err) {
        console.error('Role toggle error:', err);
      }

      // 🔒 Buttons remain static — no style mutation
    }
  }
};

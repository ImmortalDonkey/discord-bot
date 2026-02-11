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

      lines.push('**Rarity groups**');
      for (const r of rolesConfig.rarityRoles) {
        const roleId =
          guild.id === process.env.GUILD_ID
            ? process.env[r.env]
            : null;

        const has = roleId && member.roles.cache.has(roleId);
        lines.push(`${has ? '✅' : '❌'} ${r.label}`);
      }

      lines.push('');
      lines.push('**Pokémon**');
      for (const p of rolesConfig.pokemonRoles) {
        const roleId =
          guild.id === process.env.GUILD_ID
            ? process.env[p.env]
            : null;

        const has = roleId && member.roles.cache.has(roleId);
        lines.push(`${has ? '✅' : '❌'} ${p.label}`);
      }

      return interaction.reply({
        content: lines.join('\n'),
        flags: 64
      }).catch(() => {});
    }

    // ──────────────────────────────
    // 🧹 CLEAR ALL
    // ──────────────────────────────
    if (customId === 'roles_clear_all') {
      await interaction.deferReply({ flags: 64 }).catch(() => {});

      const toRemove = [];

      // In subscriber guilds, remove based on role names in config
      for (const role of member.roles.cache.values()) {
        if (
          rolesConfig.rarityRoles.some(r => r.label === role.name) ||
          rolesConfig.pokemonRoles.some(p => p.label === role.name)
        ) {
          toRemove.push(role.id);
        }
      }

      if (toRemove.length) {
        await member.roles.remove(toRemove).catch(() => {});
      }

      return interaction.editReply({
        content: '✅ Cleared all rarity and Pokémon notification roles.'
      }).catch(() => {});
    }

    // ──────────────────────────────
    // 🔘 ROLE MANAGE (ON / OFF)
    // ──────────────────────────────
    if (customId.startsWith('roles_manage_')) {
      await interaction.deferUpdate().catch(() => {});

      const { roleId, mode } = parseManageCustomId(customId);
      if (!roleId) return;

      const role = guild.roles.cache.get(roleId);
      if (!role) return;

      const hasRole = member.roles.cache.has(roleId);

      let targetOn;
      if (mode === 'on') targetOn = true;
      else if (mode === 'off') targetOn = false;
      else targetOn = !hasRole;

      if (targetOn && !hasRole) {
        await member.roles.add(roleId).catch(() => {});
      } else if (!targetOn && hasRole) {
        await member.roles.remove(roleId).catch(() => {});
      }

      // No button mutation
    }
  }
};

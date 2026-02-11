// interactions/buttons/rolesButtons.cjs

const rolesConfig = require('../../utils/rolesConfig.cjs');

function getGroupFromRarityEnv(env) {
  if (env === 'ROLE_ROAMERMONTH') return 'roamerMonth';
  if (env === 'ROLE_PARADOX') return 'paradox';
  if (env === 'ROLE_LEGENDARY') return 'legendary';
  if (env === 'ROLE_RARE') return 'rare';
  if (env === 'ROLE_COMMON') return 'common';
  return null;
}

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
        const roleId = process.env[r.env];
        const has = roleId && member.roles.cache.has(roleId);
        lines.push(`${has ? '✅' : '❌'} ${r.label}`);
      }

      lines.push('');
      lines.push('**Pokémon**');
      for (const p of rolesConfig.pokemonRoles) {
        const roleId = process.env[p.env];
        const has = roleId && member.roles.cache.has(roleId);
        lines.push(`${has ? '✅' : '❌'} ${p.label}`);
      }

      return interaction.reply({
        content: lines.join('\n'),
        ephemeral: true
      }).catch(() => {});
    }

    // ──────────────────────────────
    // 🧹 CLEAR ALL
    // ──────────────────────────────
    if (customId === 'roles_clear_all') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const toRemove = [];

      for (const r of rolesConfig.rarityRoles) {
        const roleId = process.env[r.env];
        if (roleId && member.roles.cache.has(roleId)) {
          toRemove.push(roleId);
        }
      }

      for (const p of rolesConfig.pokemonRoles) {
        const roleId = process.env[p.env];
        if (roleId && member.roles.cache.has(roleId)) {
          toRemove.push(roleId);
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

      const rarityEntry = rolesConfig.rarityRoles.find(
        r => process.env[r.env] === roleId
      );

      if (rarityEntry) {
        if (targetOn && !hasRole) {
          await member.roles.add(roleId).catch(() => {});
        } else if (!targetOn && hasRole) {
          await member.roles.remove(roleId).catch(() => {});
        }
      } else {
        if (targetOn && !hasRole) {
          await member.roles.add(roleId).catch(() => {});
        } else if (!targetOn && hasRole) {
          await member.roles.remove(roleId).catch(() => {});
        }
      }

      // 🚫 NO BUTTON STYLE UPDATES
      // 🚫 NO MESSAGE EDITING
      // Buttons remain static (green ON / red OFF)
    }
  }
};

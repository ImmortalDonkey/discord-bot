/**
 * Global role buttons
 * - View my notifications
 * - Clear all
 *
 * SAFETY:
 * - ONLY touches rarity + pokemon roles from rolesConfig
 */

const rolesConfig = require('../../utils/rolesConfig.cjs');

module.exports = {
  ids: [
    'role:view_status',
    'role:clear_all'
  ],

  async execute(client, interaction) {
    const member = interaction.member;
    if (!member) return;

    // ──────────────────────────────
    // VIEW MY NOTIFICATIONS
    // ──────────────────────────────
    if (interaction.customId === 'role:view_status') {
      const lines = [];

      lines.push('**Rarity Groups**');
      for (const r of rolesConfig.rarityRoles) {
        const roleId = process.env[r.env];
        const enabled = roleId && member.roles.cache.has(roleId);
        lines.push(`${enabled ? '✅' : '❌'} ${r.label}`);
      }

      lines.push('');
      lines.push('**Individual Pokémon**');
      for (const p of rolesConfig.pokemonRoles) {
        const roleId = process.env[p.env];
        const enabled = roleId && member.roles.cache.has(roleId);
        lines.push(`${enabled ? '✅' : '❌'} ${p.label}`);
      }

      return interaction.reply({
        embeds: [{
          title: '🔔 Your Roamer Notifications',
          description: lines.join('\n'),
          color: 0x22c55e
        }],
        ephemeral: true
      });
    }

    // ──────────────────────────────
    // CLEAR ALL (RARITY + POKEMON ONLY)
    // ──────────────────────────────
    if (interaction.customId === 'role:clear_all') {
      const roleIdsToRemove = [];

      for (const r of rolesConfig.rarityRoles) {
        const id = process.env[r.env];
        if (id && member.roles.cache.has(id)) roleIdsToRemove.push(id);
      }

      for (const p of rolesConfig.pokemonRoles) {
        const id = process.env[p.env];
        if (id && member.roles.cache.has(id)) roleIdsToRemove.push(id);
      }

      if (roleIdsToRemove.length) {
        await member.roles.remove(roleIdsToRemove).catch(() => {});
      }

      return interaction.reply({
        content: '✅ All roamer notification roles have been cleared.',
        ephemeral: true
      });
    }
  }
};
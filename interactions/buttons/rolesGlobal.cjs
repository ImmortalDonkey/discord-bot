/**
 * Global role buttons
 * - Clear all
 * - View my notifications
 *
 * SAFETY:
 * - ONLY touches rarity + pokemon roles from rolesConfig
 */

const rolesConfig = require('../../utils/rolesConfig.cjs');

module.exports = {
  ids: [
    'role:clear_all',
    'role:view_status'
  ],

  async execute(client, interaction) {
    const member = interaction.member;
    if (!member) return;

    // ──────────────────────────────
    // CLEAR ALL (RARITY + POKEMON ONLY)
    // ──────────────────────────────
    if (interaction.customId === 'role:clear_all') {
      const roleIdsToRemove = [];

      // Rarity roles
      for (const r of rolesConfig.rarityRoles) {
        const id = process.env[r.env];
        if (id && member.roles.cache.has(id)) {
          roleIdsToRemove.push(id);
        }
      }

      // Pokémon roles
      for (const p of rolesConfig.pokemonRoles) {
        const id = process.env[p.env];
        if (id && member.roles.cache.has(id)) {
          roleIdsToRemove.push(id);
        }
      }

      if (roleIdsToRemove.length) {
        await member.roles.remove(roleIdsToRemove).catch(() => {});
      }

      return interaction.reply({
        content: '✅ All roamer notification roles have been cleared.',
        ephemeral: true
      });
    }

    // ──────────────────────────────
    // VIEW STATUS
    // ──────────────────────────────
    if (interaction.customId === 'role:view_status') {
      const lines = [];

      lines.push('**Rarity Groups**');
      for (const r of rolesConfig.rarityRoles) {
        const id = process.env[r.env];
        const has = id && member.roles.cache.has(id);
        lines.push(`${has ? '✅' : '❌'} ${r.label}`);
      }

      lines.push('');
      lines.push('**Individual Pokémon**');
      for (const p of rolesConfig.pokemonRoles) {
        const id = process.env[p.env];
        const has = id && member.roles.cache.has(id);
        lines.push(`${has ? '✅' : '❌'} ${p.label}`);
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
  }
};
// interactions/buttons/rolesButtons.cjs

const rolesConfig = require('../../utils/rolesConfig.cjs');
const db = require('../../database.cjs');

function parseManageCustomId(customId) {
  const raw = customId.replace('roles_manage_', '');
  const [roleId, mode] = raw.split(':');
  return { roleId, mode: mode || null };
}

// ENV → DB rarity_key mapping
function rarityEnvToDbKey(env) {
  const e = String(env || '').toUpperCase();
  if (e === 'ROLE_PARADOX') return 'paradox';
  if (e === 'ROLE_ROAMERMONTH') return 'roamer_month';
  if (e === 'ROLE_LEGENDARY') return 'legendary';
  if (e === 'ROLE_RARE') return 'rare';
  if (e === 'ROLE_COMMON') return 'common';
  return null;
}

// Label → DB pokemon_key
function labelToDbPokemonKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[()']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

module.exports = {
  ids: ['roles_manage_', 'roles_clear_all', 'roles_view_status'],

  async execute(client, interaction) {
    const { customId } = interaction;
    const guild = interaction.guild;

    if (!guild) return;

    const member = await guild.members.fetch(interaction.user.id);
    const isMain = guild.id === process.env.GUILD_ID;

    // ──────────────────────────────
    // 👁 VIEW MY NOTIFICATIONS
    // ──────────────────────────────
    if (customId === 'roles_view_status') {
      const lines = [];

      // ───── RARITY GROUPS ─────
      lines.push('**Rarity Groups**');

      for (const r of rolesConfig.rarityRoles) {
        let roleId = null;

        if (isMain) {
          roleId = process.env[r.env];
        } else {
          const dbKey = rarityEnvToDbKey(r.env);
          if (dbKey) {
            const row = await db.getGuildRarityRole(guild.id, dbKey);
            roleId = row?.role_id || null;
          }
        }

        const has = roleId && member.roles.cache.has(roleId);
        lines.push(`${has ? '✅' : '❌'} ${r.label}`);
      }

      lines.push('');
      lines.push('**Individual Pokémon**');

      for (const p of rolesConfig.pokemonRoles) {
        let roleId = null;

        if (isMain) {
          roleId = process.env[p.env];
        } else {
          const pokemonKey = labelToDbPokemonKey(p.label);
          const row = await db.getGuildPokemonRole(guild.id, pokemonKey);
          roleId = row?.role_id || null;
        }

        const has = roleId && member.roles.cache.has(roleId);
        lines.push(`${has ? '✅' : '❌'} ${p.label}`);
      }

      return interaction.reply({
        embeds: [{
          title: '🔔 Your Roamer Notifications',
          description: lines.join('\n'),
          color: 0x22c55e
        }],
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

      // Buttons remain static (no style mutation)
    }
  }
};

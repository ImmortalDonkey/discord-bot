// interactions/buttons/rolesButtons.cjs
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

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
  // formats:
  // roles_manage_<ROLEID>:on
  // roles_manage_<ROLEID>:off
  // (legacy) roles_manage_<ROLEID>
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
    // VIEW STATUS
    // ──────────────────────────────
    if (customId === 'roles_view_status') {
      const rarityHeld = [];
      for (const r of rolesConfig.rarityRoles) {
        const roleId = process.env[r.env];
        if (roleId && member.roles.cache.has(roleId)) rarityHeld.push(r.label);
      }

      const pokemonHeld = [];
      for (const p of rolesConfig.pokemonRoles) {
        const roleId = process.env[p.env];
        if (roleId && member.roles.cache.has(roleId)) pokemonHeld.push(p.label);
      }

      const lines = [];
      lines.push(`**Rarity groups:** ${rarityHeld.length ? rarityHeld.join(', ') : 'None'}`);
      lines.push(`**Pokémon:** ${pokemonHeld.length ? pokemonHeld.join(', ') : 'None'}`);

      return interaction.reply({
        content: lines.join('\n'),
        ephemeral: true
      }).catch(() => {});
    }

    // ──────────────────────────────
    // CLEAR ALL (rarity + pokemon only)
    // ──────────────────────────────
    if (customId === 'roles_clear_all') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const toRemove = [];

      for (const r of rolesConfig.rarityRoles) {
        const roleId = process.env[r.env];
        if (roleId && member.roles.cache.has(roleId)) toRemove.push(roleId);
      }
      for (const p of rolesConfig.pokemonRoles) {
        const roleId = process.env[p.env];
        if (roleId && member.roles.cache.has(roleId)) toRemove.push(roleId);
      }

      if (toRemove.length) {
        await member.roles.remove(toRemove).catch(() => {});
      }

      return interaction.editReply({
        content: '✅ Cleared all rarity + Pokémon notification roles.'
      }).catch(() => {});
    }

    // ──────────────────────────────
    // ROLE MANAGE (ON / OFF semantics)
    // ──────────────────────────────
    if (customId.startsWith('roles_manage_')) {
      await interaction.deferUpdate().catch(() => {});

      const { roleId, mode } = parseManageCustomId(customId);
      if (!roleId) return;

      const role = guild.roles.cache.get(roleId);
      if (!role) return;

      const hasRole = member.roles.cache.has(roleId);

      // Detect if this roleId is a rarity role
      const rarityEntry = rolesConfig.rarityRoles.find(r => process.env[r.env] === roleId);

      // Decide desired state
      // mode 'on' => ensure ON
      // mode 'off' => ensure OFF
      // legacy => toggle
      let targetOn;
      if (mode === 'on') targetOn = true;
      else if (mode === 'off') targetOn = false;
      else targetOn = !hasRole;

      // ──────────────────────────────
      // RARITY GROUP APPLY (with cascade)
      // ──────────────────────────────
      if (rarityEntry) {
        const groupKey = getGroupFromRarityEnv(rarityEntry.env);

        const pokemonInGroup = groupKey
          ? rolesConfig.pokemonRoles.filter(p => p.group === groupKey)
          : [];

        if (targetOn) {
          if (!hasRole) await member.roles.add(roleId).catch(() => {});
          for (const poke of pokemonInGroup) {
            const pokeRoleId = process.env[poke.env];
            if (pokeRoleId && !member.roles.cache.has(pokeRoleId)) {
              await member.roles.add(pokeRoleId).catch(() => {});
            }
          }
        } else {
          if (hasRole) await member.roles.remove(roleId).catch(() => {});
          for (const poke of pokemonInGroup) {
            const pokeRoleId = process.env[poke.env];
            if (pokeRoleId && member.roles.cache.has(pokeRoleId)) {
              await member.roles.remove(pokeRoleId).catch(() => {});
            }
          }
        }
      }

      // ──────────────────────────────
      // INDIVIDUAL POKÉMON APPLY
      // ──────────────────────────────
      else {
        if (targetOn) {
          if (!hasRole) await member.roles.add(roleId).catch(() => {});
        } else {
          if (hasRole) await member.roles.remove(roleId).catch(() => {});
        }
      }

      // ──────────────────────────────
      // UPDATE BUTTON STYLES (ON reflects truth)
      // ──────────────────────────────
      const nowHasRole = member.roles.cache.has(roleId);
      const row = interaction.message.components?.[0];
      if (!row) return;

      const newRow = new ActionRowBuilder();

      for (const c of row.components) {
        const b = ButtonBuilder.from(c);

        // We set ON green only when enabled. OFF remains secondary.
        if (String(b.data.custom_id || '').endsWith(':on')) {
          b.setStyle(nowHasRole ? ButtonStyle.Success : ButtonStyle.Secondary);
        } else if (String(b.data.custom_id || '').endsWith(':off')) {
          b.setStyle(ButtonStyle.Secondary);
        }

        newRow.addComponents(b);
      }

      await interaction.message.edit({ components: [newRow] }).catch(() => {});
    }
  }
};

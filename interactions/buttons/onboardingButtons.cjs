const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

/* ─────────────────────────────
   ROLE DEFINITIONS
───────────────────────────── */
const ROLE_KEYS = {
  paradox: { label: 'Paradox', env: 'ROLE_PARADOX' },
  roamerMonth: { label: 'Roamer of the Month', env: 'ROLE_ROAMERMONTH' },
  legendary: { label: 'Legendary / Rare', env: 'ROLE_LEGENDARY' },
  common: { label: 'Common', env: 'ROLE_COMMON' },

  bounty: { label: 'Bounty Hunting', env: 'ROLE_BOUNTY_HUNTER' },
  mob: { label: 'Mob Hunting', env: 'ROLE_MOB_HUNTER' },
  witch: { label: 'Witch Hunting', env: 'ROLE_WITCH_HUNTER' }
};

/* ─────────────────────────────
   INFO MESSAGES
───────────────────────────── */
const INFO_MESSAGES = {
  bounty: `🏹 **Bounty Hunting**

Take part in time-limited Pokémon bounties posted by staff and the community.

• Hunt specific Pokémon  
• Submit proof of capture  
• Earn PKD rewards`,

  mob: `🧟 **Mob Hunting**

Participate in large-scale Pokémon hunts.

• High-activity group hunts  
• Encourages teamwork`,

  witch: `🧙 **Witch Hunting**

Investigation-style gameplay.

• Track roamer captures  
• Deduce roaming locations`
};

/* ─────────────────────────────
   SELECTION STATE
───────────────────────────── */
function getUserSelection(client, userId) {
  if (!client.onboardingSelections) {
    client.onboardingSelections = new Map();
  }
  if (!client.onboardingSelections.has(userId)) {
    client.onboardingSelections.set(userId, new Set());
  }
  return client.onboardingSelections.get(userId);
}

function seedSelectionFromMember(client, member) {
  const selection = getUserSelection(client, member.id);
  selection.clear();

  for (const [key, cfg] of Object.entries(ROLE_KEYS)) {
    const roleId = process.env[cfg.env];
    if (roleId && member.roles.cache.has(roleId)) {
      selection.add(key);
    }
  }
}

/* ─────────────────────────────
   PANEL BUILDER
───────────────────────────── */
function buildPanel(client, userId) {
  const selected = getUserSelection(client, userId);

  const embed = new EmbedBuilder()
    .setTitle('Choose your roles')
    .setDescription(
      '_You will receive notifications based on your selection._\n\n' +
      '**Roaming Pokémon:** Select rarity(s)\n' +
      '**Other:** Optional gameplay roles\n\n' +
      '📝 Editable later in **#roles**'
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_paradox').setLabel(selected.has('paradox') ? '✅ Paradox' : 'Paradox').setStyle(selected.has('paradox') ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_roamerMonth').setLabel(selected.has('roamerMonth') ? '✅ Roamer of the Month' : 'Roamer of the Month').setStyle(selected.has('roamerMonth') ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_legendary').setLabel(selected.has('legendary') ? '✅ Legendary / Rare' : 'Legendary / Rare').setStyle(selected.has('legendary') ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_common').setLabel(selected.has('common') ? '✅ Common' : 'Common').setStyle(selected.has('common') ? ButtonStyle.Success : ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_bounty').setLabel('Bounty Hunting').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('info_bounty').setLabel('ℹ️ Info').setStyle(ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('onboard_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('onboard_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

/* ─────────────────────────────
   HANDLER
───────────────────────────── */
module.exports = {
  ids: [
    'onboard_yes',
    'onboard_no',
    'onboard_confirm',
    'onboard_cancel',
    ...Object.keys(ROLE_KEYS).map(k => `role_${k}`),
    ...Object.keys(INFO_MESSAGES).map(k => `info_${k}`)
  ],

  async execute(client, interaction) {
    if (process.env.NODE_ENV !== 'dev') return;

    const { customId, member, guild, user } = interaction;

    /* 🔑 ALWAYS ACK IMMEDIATELY */
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }

    /* YES */
    if (customId === 'onboard_yes') {
      await member.roles.add(process.env.ROLE_TRAINER).catch(() => {});
      await member.roles.remove(process.env.ROLE_NEW_ARRIVAL).catch(() => {});
      seedSelectionFromMember(client, member);
      return interaction.editReply(buildPanel(client, user.id));
    }

    /* NO */
    if (customId === 'onboard_no') {
      await member.roles.add(process.env.ROLE_GUEST).catch(() => {});
      await member.roles.remove(process.env.ROLE_NEW_ARRIVAL).catch(() => {});
      return interaction.editReply({ content: 'Welcome! Roles can be changed later.', components: [] });
    }

    const selection = getUserSelection(client, user.id);

    /* ROLE TOGGLE */
    if (customId.startsWith('role_')) {
      const key = customId.replace('role_', '');
      selection.has(key) ? selection.delete(key) : selection.add(key);
      return interaction.editReply(buildPanel(client, user.id));
    }

    /* INFO */
    if (customId.startsWith('info_')) {
      return interaction.followUp({ content: INFO_MESSAGES[customId.replace('info_', '')], ephemeral: true });
    }

    /* CONFIRM */
    if (customId === 'onboard_confirm') {
      for (const [key, cfg] of Object.entries(ROLE_KEYS)) {
        const roleId = process.env[cfg.env];
        if (!roleId) continue;
        selection.has(key)
          ? await member.roles.add(roleId).catch(() => {})
          : await member.roles.remove(roleId).catch(() => {});
      }

      await member.roles.remove(process.env.ROLE_NEW_ARRIVAL).catch(() => {});
      selection.clear();

      return interaction.editReply({ content: '✅ Roles updated.', embeds: [], components: [] });
    }

    /* CANCEL */
    if (customId === 'onboard_cancel') {
      selection.clear();
      return interaction.editReply({ content: '❌ Cancelled.', embeds: [], components: [] });
    }
  }
};
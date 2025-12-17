const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

/* ─────────────────────────────
   DEBUG HELPER
───────────────────────────── */
function dbg(...args) {
  console.log('[ONBOARDING]', ...args);
}

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
  bounty: 'Bounty info',
  mob: 'Mob info',
  witch: 'Witch info'
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

/* ─────────────────────────────
   PREFILL FROM MEMBER ROLES
───────────────────────────── */
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
   UI HELPERS
───────────────────────────── */
function roleButton(key, selected) {
  return new ButtonBuilder()
    .setCustomId(`role_${key}`)
    .setLabel(selected ? `✅ ${ROLE_KEYS[key].label}` : ROLE_KEYS[key].label)
    .setStyle(selected ? ButtonStyle.Success : ButtonStyle.Secondary);
}

function infoButton(key) {
  return new ButtonBuilder()
    .setCustomId(`info_${key}`)
    .setLabel('ℹ️ Info')
    .setStyle(ButtonStyle.Primary);
}

/* ─────────────────────────────
   PANEL BUILDER
───────────────────────────── */
function buildPanel(client, userId) {
  const selected = getUserSelection(client, userId);

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('Choose your roles')
        .setDescription('Debug panel')
    ],
    components: [
      new ActionRowBuilder().addComponents(
        roleButton('paradox', selected.has('paradox')),
        roleButton('roamerMonth', selected.has('roamerMonth')),
        roleButton('legendary', selected.has('legendary')),
        roleButton('common', selected.has('common'))
      ),
      new ActionRowBuilder().addComponents(
        roleButton('bounty', selected.has('bounty')),
        infoButton('bounty')
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('onboard_confirm')
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('onboard_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
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
    'roles_open',
    'onboard_confirm',
    'onboard_cancel',
    ...Object.keys(ROLE_KEYS).map(k => `role_${k}`),
    ...Object.keys(INFO_MESSAGES).map(k => `info_${k}`)
  ],

  async execute(client, interaction) {
    const { customId, user, member } = interaction;

    dbg('CLICK', customId);
    dbg('ACK STATE', {
      replied: interaction.replied,
      deferred: interaction.deferred
    });

    try {
      // DEV ONLY
      if (process.env.NODE_ENV !== 'dev') {
        dbg('BLOCKED: not dev');
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({ content: 'Disabled', ephemeral: true });
        }
        return;
      }

      // YES
      if (customId === 'onboard_yes') {
        dbg('YES clicked');

        seedSelectionFromMember(client, member);

        return interaction.reply({
          ...buildPanel(client, user.id),
          ephemeral: true
        });
      }

      // ROLE TOGGLE
      if (customId.startsWith('role_')) {
        dbg('ROLE TOGGLE', customId);

        const selection = getUserSelection(client, user.id);
        const key = customId.replace('role_', '');

        selection.has(key)
          ? selection.delete(key)
          : selection.add(key);

        dbg('SELECTION NOW', [...selection]);

        return interaction.update(buildPanel(client, user.id));
      }

      // INFO
      if (customId.startsWith('info_')) {
        dbg('INFO clicked', customId);
        return interaction.reply({
          content: INFO_MESSAGES[customId.replace('info_', '')],
          ephemeral: true
        });
      }

      // CONFIRM
      if (customId === 'onboard_confirm') {
        dbg('CONFIRM');
        return interaction.update({
          content: 'Confirmed',
          embeds: [],
          components: []
        });
      }

      // CANCEL
      if (customId === 'onboard_cancel') {
        dbg('CANCEL');
        return interaction.update({
          content: 'Cancelled',
          embeds: [],
          components: []
        });
      }

      dbg('UNHANDLED BUTTON', customId);

    } catch (err) {
      console.error('❌ ONBOARDING ERROR:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Internal error (see logs)',
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
};
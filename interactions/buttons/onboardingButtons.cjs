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
   INFO MESSAGES (unchanged)
───────────────────────────── */
const INFO_MESSAGES = {
  bounty: `🏹 **Bounty Hunting**
Take part in time-limited Pokémon bounties.`,
  mob: `🧟 **Mob Hunting**
Large-scale group hunts.`,
  witch: `🧙 **Witch Hunting**
Investigation-based gameplay.`
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
        .setDescription(
          '_You will receive notifications based on your selection._\n\n' +
          '**Roaming Pokémon:** Select rarity(s)\n' +
          '**Other:** Optional gameplay roles\n\n' +
          '📝 Roles can be edited later in **#roles**.'
        )
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
        roleButton('mob', selected.has('mob')),
        infoButton('mob')
      ),
      new ActionRowBuilder().addComponents(
        roleButton('witch', selected.has('witch')),
        infoButton('witch')
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
    const { customId, user, member, guild } = interaction;

    if (process.env.NODE_ENV !== 'dev') {
      return interaction.reply({ content: 'Onboarding disabled.', ephemeral: true });
    }

    /* YES → trainer */
    if (customId === 'onboard_yes') {
      const trainer = guild.roles.cache.get(process.env.ROLE_TRAINER);
      const newArrival = guild.roles.cache.get(process.env.ROLE_NEW_ARRIVAL);

      if (trainer) await member.roles.add(trainer).catch(() => {});
      if (newArrival) await member.roles.remove(newArrival).catch(() => {});

      seedSelectionFromMember(client, member);

      return interaction.reply({
        ...buildPanel(client, user.id),
        ephemeral: true
      });
    }

    /* NO → guest */
    if (customId === 'onboard_no') {
      const guest = guild.roles.cache.get(process.env.ROLE_GUEST);
      const newArrival = guild.roles.cache.get(process.env.ROLE_NEW_ARRIVAL);

      if (guest) await member.roles.add(guest).catch(() => {});
      if (newArrival) await member.roles.remove(newArrival).catch(() => {});

      return interaction.update({
        content: `👋 Welcome ${member}! You can change roles later in <#${process.env.CHANNEL_ROLES}>.`,
        components: []
      });
    }

    /* OPEN FROM #roles */
    if (customId === 'roles_open') {
      seedSelectionFromMember(client, member);
      return interaction.reply({
        ...buildPanel(client, user.id),
        ephemeral: true
      });
    }

    const selection = getUserSelection(client, user.id);

    /* TOGGLE */
    if (customId.startsWith('role_')) {
      const key = customId.replace('role_', '');
      selection.has(key) ? selection.delete(key) : selection.add(key);
      return interaction.update(buildPanel(client, user.id));
    }

    /* INFO */
    if (customId.startsWith('info_')) {
      return interaction.reply({
        content: INFO_MESSAGES[customId.replace('info_', '')],
        ephemeral: true
      });
    }

    /* CONFIRM */
    if (customId === 'onboard_confirm') {
      for (const [key, cfg] of Object.entries(ROLE_KEYS)) {
        const roleId = process.env[cfg.env];
        if (!roleId) continue;

        const role = guild.roles.cache.get(roleId);
        if (!role) continue;

        if (selection.has(key)) {
          await member.roles.add(role).catch(() => {});
        } else {
          await member.roles.remove(role).catch(() => {});
        }
      }

      const newArrival = guild.roles.cache.get(process.env.ROLE_NEW_ARRIVAL);
      if (newArrival) await member.roles.remove(newArrival).catch(() => {});

      selection.clear();

      return interaction.update({
        content: '✅ Your roles have been updated.',
        embeds: [],
        components: []
      });
    }

    /* CANCEL */
    if (customId === 'onboard_cancel') {
      selection.clear();
      return interaction.update({
        content: '❌ Role selection cancelled.',
        embeds: [],
        components: []
      });
    }
  }
};
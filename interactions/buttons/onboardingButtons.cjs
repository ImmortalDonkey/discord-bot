const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

// ─────────────────────────────
// ROLE DEFINITIONS
// ─────────────────────────────
const ROLE_KEYS = {
  paradox: { label: 'Paradox', env: 'ROLE_PARADOX' },
  roamerMonth: { label: 'Roamer of the Month', env: 'ROLE_ROAMERMONTH' },
  legendary: { label: 'Legendary / Rare', env: 'ROLE_LEGENDARY' },
  common: { label: 'Common', env: 'ROLE_COMMON' },

  bounty: { label: 'Bounty Hunting', env: 'ROLE_BOUNTY_HUNTER' },
  mob: { label: 'Mob Hunting', env: 'ROLE_MOB_HUNTER' },
  witch: { label: 'Witch Hunting', env: 'ROLE_WITCH_HUNTER' }
};

// ─────────────────────────────
// INFO MESSAGES (UNCHANGED)
// ─────────────────────────────
const INFO_MESSAGES = {
  bounty: `🏹 **Bounty Hunting**

Bounty Hunting  
Take part in time-limited Pokémon bounties posted by staff and the community.

• Hunt specific Pokémon  
• Submit proof of capture  
• Earn PKD rewards  

Ideal if you enjoy competitive hunting and challenge-based gameplay.`,

  mob: `🧟 **Mob Hunting**

Mob Hunting  
Participate in large-scale Pokémon hunts where many players hunt the same route at the same time.

• High-activity group hunts  
• Great for consistent grinders  
• Encourages teamwork  

Ideal if you enjoy steady farming and coordinated hunting.`,

  witch: `🧙 **Witch Hunting**

Witch Hunting  
Take part in investigation-style gameplay to track down roaming Pokémon activity.

• Track players who captured a roamer  
• Use “Recently Obtained Pokémon” data  
• Deduce the roamer’s location  

Ideal if you enjoy investigation, deduction, and strategic tracking.`
};

// ─────────────────────────────
// SELECTION STATE (per user)
// ─────────────────────────────
function getUserSelection(client, userId) {
  if (!client.onboardingSelections) {
    client.onboardingSelections = new Map();
  }
  if (!client.onboardingSelections.has(userId)) {
    client.onboardingSelections.set(userId, new Set());
  }
  return client.onboardingSelections.get(userId);
}

// ─────────────────────────────
// PREFILL FROM MEMBER ROLES
// ─────────────────────────────
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

// ─────────────────────────────
// UI HELPERS
// ─────────────────────────────
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

// ─────────────────────────────
// PANEL BUILDER
// ─────────────────────────────
function buildPanel(client, userId) {
  const selected = getUserSelection(client, userId);

  const embed = new EmbedBuilder()
    .setTitle('Choose your roles')
    .setDescription(
      '_You will receive notifications based on your selection._\n\n' +
      '**Roaming Pokémon:**\n' +
      'Select the rarity(s).\n\n' +
      '**Other:**\n' +
      'Optional gameplay roles _(click **Info** to see details)_.\n\n' +
      '📝 Roles can be edited later in **#roles**.'
    );

  return {
    embeds: [embed],
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
          .setCustomId('onboard_reset')
          .setLabel('Reset')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('onboard_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

// ─────────────────────────────
// HANDLER
// ─────────────────────────────
module.exports = {
  ids: [
    'onboard_yes',
    'roles_open',
    'onboard_confirm',
    'onboard_reset',
    'onboard_cancel',
    'info_bounty',
    'info_mob',
    'info_witch',
    ...Object.keys(ROLE_KEYS).map(k => `role_${k}`)
  ],

  async execute(client, interaction) {
    const { member, guild, customId, user } = interaction;

    if (process.env.ENV !== 'dev') {
  return interaction.reply({ content: 'Onboarding disabled.', ephemeral: true });
}

    // OPEN FROM #roles BUTTON
    if (customId === 'roles_open') {
      seedSelectionFromMember(client, member);
      return interaction.reply({
        ...buildPanel(client, user.id),
        ephemeral: true
      });
    }

    const selection = getUserSelection(client, user.id);

    // ROLE TOGGLE
    if (customId.startsWith('role_')) {
      const key = customId.replace('role_', '');
      selection.has(key) ? selection.delete(key) : selection.add(key);
      return interaction.update(buildPanel(client, user.id));
    }

    // INFO
    if (customId.startsWith('info_')) {
      const key = customId.replace('info_', '');
      return interaction.reply({
        content: INFO_MESSAGES[key],
        ephemeral: true
      });
    }

    // RESET
    if (customId === 'onboard_reset') {
      seedSelectionFromMember(client, member);
      return interaction.update(buildPanel(client, user.id));
    }

    // CANCEL
    if (customId === 'onboard_cancel') {
      selection.clear();
      return interaction.update({
        content: '❌ Role selection cancelled.',
        embeds: [],
        components: []
      });
    }

    // CONFIRM
    if (customId === 'onboard_confirm') {
      for (const [key, cfg] of Object.entries(ROLE_KEYS)) {
        const roleId = process.env[cfg.env];
        if (!roleId) continue;

        const role = guild.roles.cache.get(roleId);
        if (!role) continue;

        if (selection.has(key)) {
          await member.roles.add(role);
        } else {
          await member.roles.remove(role).catch(() => {});
        }
      }

      selection.clear();

      return interaction.update({
        content: '✅ Your roles have been updated.',
        embeds: [],
        components: []
      });
    }
  }
};

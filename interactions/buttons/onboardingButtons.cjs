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
// INFO MESSAGES (UPDATED EXACTLY)
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
// SELECTION STATE
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
      '**Roaming Pokémon**\n' +
      'Select which roaming notifications you want.\n\n' +
      '**Other**\n' +
      'Optional gameplay roles.\n\n' +
      '📝 Roles can be edited later in **#roles**.'
    );

  return {
    embeds: [embed],
    components: [
      // ── Roaming Pokémon
      new ActionRowBuilder().addComponents(
        roleButton('paradox', selected.has('paradox'))
      ),
      new ActionRowBuilder().addComponents(
        roleButton('roamerMonth', selected.has('roamerMonth'))
      ),
      new ActionRowBuilder().addComponents(
        roleButton('legendary', selected.has('legendary'))
      ),
      new ActionRowBuilder().addComponents(
        roleButton('common', selected.has('common'))
      ),

      // ── Other (role + info inline)
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

      // ── Controls
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

    if (process.env.NODE_ENV !== 'dev') {
      return interaction.reply({ content: 'Onboarding disabled.', ephemeral: true });
    }

    const selection = getUserSelection(client, user.id);

    // YES → open ephemeral panel in #start-here
    if (customId === 'onboard_yes') {
      return interaction.reply({
        ...buildPanel(client, user.id),
        ephemeral: true
      });
    }

    // ROLE TOGGLE
    if (customId.startsWith('role_')) {
      const key = customId.replace('role_', '');
      selection.has(key) ? selection.delete(key) : selection.add(key);
      return interaction.update(buildPanel(client, user.id));
    }

    // INFO
    if (customId.startsWith('info_')) {
      const key = customId.replace('info_', '');
      return interaction.reply({ content: INFO_MESSAGES[key], ephemeral: true });
    }

    // RESET
    if (customId === 'onboard_reset') {
      selection.clear();
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
      for (const key of selection) {
        const roleId = process.env[ROLE_KEYS[key].env];
        const role = guild.roles.cache.get(roleId);
        if (role) await member.roles.add(role);
      }

      const trainer = guild.roles.cache.get(process.env.ROLE_TRAINER);
      const newArrival = guild.roles.cache.get(process.env.ROLE_NEW_ARRIVAL);

      if (trainer) await member.roles.add(trainer);
      if (newArrival) await member.roles.remove(newArrival);

      selection.clear();

      return interaction.update({
        content: `✅ Roles applied! You can edit these anytime in <#${process.env.CHANNEL_ROLES}>.`,
        embeds: [],
        components: []
      });
    }
  }
};

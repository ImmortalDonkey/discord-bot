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
  paradox: {
    label: 'Paradox',
    env: 'ROLE_PARADOX'
  },
  roamerMonth: {
    label: 'Roamer of the Month',
    env: 'ROLE_ROAMERMONTH'
  },
  legendary: {
    label: 'Legendary / Rare',
    env: 'ROLE_LEGENDARY'
  },
  common: {
    label: 'Common',
    env: 'ROLE_COMMON'
  },
  bounty: {
    label: 'Bounty Hunting',
    env: 'ROLE_BOUNTY_HUNTER'
  },
  mob: {
    label: 'Mob Hunting',
    env: 'ROLE_MOB_HUNTER'
  },
  witch: {
    label: 'Witch Hunting',
    env: 'ROLE_WITCH_HUNTER'
  }
};

// ─────────────────────────────
// INFO MESSAGES
// ─────────────────────────────
const INFO_MESSAGES = {
  bounty: `⚔️ **Bounty Hunting**

Take part in time-limited Pokémon bounties posted by staff and the community.

• Hunt specific Pokémon  
• Submit proof  
• Earn PKD  

Ideal if you like competitive hunting and challenges.`,
  mob: `🧟 **Mob Hunting**

Focus on large-scale Pokémon hunts that require high numbers of players hunting a route simultaneously.

• High activity hunts  
• Great for consistent grinders  

Ideal if you enjoy steady farming and teamwork.`,
  witch: `🧙 **Witch Hunting**

Participate in investigations.

• Track down players who recently caught roamers  
• Coordinate with others to locate targets`
};

// ─────────────────────────────
// HELPERS
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

function buildRoleButton(key, selected) {
  return new ButtonBuilder()
    .setCustomId(`role_${key}`)
    .setLabel(selected ? `✅ ${ROLE_KEYS[key].label}` : ROLE_KEYS[key].label)
    .setStyle(selected ? ButtonStyle.Success : ButtonStyle.Secondary);
}

// ─────────────────────────────
// MAIN PANEL RENDER
// ─────────────────────────────
function buildPanel(client, userId) {
  const selected = getUserSelection(client, userId);

  const embed = new EmbedBuilder()
    .setTitle('Choose your roles')
    .setDescription(
      'Pick one or more roles, then press **Confirm**.\n' +
      'You can change this anytime in **#roles**.'
    );

  const row1 = new ActionRowBuilder().addComponents(
    buildRoleButton('paradox', selected.has('paradox')),
    buildRoleButton('roamerMonth', selected.has('roamerMonth')),
    buildRoleButton('legendary', selected.has('legendary')),
    buildRoleButton('common', selected.has('common'))
  );

  const row2 = new ActionRowBuilder().addComponents(
    buildRoleButton('bounty', selected.has('bounty')),
    buildRoleButton('mob', selected.has('mob')),
    buildRoleButton('witch', selected.has('witch'))
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('info_bounty')
      .setLabel('ℹ️ Bounty Info')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('info_mob')
      .setLabel('ℹ️ Mob Info')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('info_witch')
      .setLabel('ℹ️ Witch Info')
      .setStyle(ButtonStyle.Primary)
  );

  const row4 = new ActionRowBuilder().addComponents(
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
  );

  return {
    embeds: [embed],
    components: [row1, row2, row3, row4]
  };
}

// ─────────────────────────────
// EXPORT
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

    // ───── YES ─────
    if (customId === 'onboard_yes') {
      return interaction.reply({
        ...buildPanel(client, user.id),
        ephemeral: true
      });
    }

    // ───── ROLE TOGGLE ─────
    if (customId.startsWith('role_')) {
      const key = customId.replace('role_', '');
      if (selection.has(key)) selection.delete(key);
      else selection.add(key);

      return interaction.update(buildPanel(client, user.id));
    }

    // ───── INFO ─────
    if (customId.startsWith('info_')) {
      const key = customId.replace('info_', '');
      return interaction.reply({
        content: INFO_MESSAGES[key],
        ephemeral: true
      });
    }

    // ───── RESET ─────
    if (customId === 'onboard_reset') {
      selection.clear();
      return interaction.update(buildPanel(client, user.id));
    }

    // ───── CANCEL ─────
    if (customId === 'onboard_cancel') {
      selection.clear();
      return interaction.update({
        content: '❌ Onboarding cancelled.',
        components: [],
        embeds: []
      });
    }

    // ───── CONFIRM ─────
    if (customId === 'onboard_confirm') {
      for (const key of selection) {
        const roleId = process.env[ROLE_KEYS[key].env];
        const role = guild.roles.cache.get(roleId);
        if (role) await member.roles.add(role);
      }

      const newArrival = guild.roles.cache.get(process.env.ROLE_NEW_ARRIVAL);
      const trainer = guild.roles.cache.get(process.env.ROLE_TRAINER);

      if (trainer) await member.roles.add(trainer);
      if (newArrival) await member.roles.remove(newArrival);

      selection.clear();

      return interaction.update({
        content: `✅ You're all set! Head to <#${process.env.CHANNEL_TUTORIAL}> to get started.`,
        components: [],
        embeds: []
      });
    }
  }
};

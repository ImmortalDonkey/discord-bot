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
// INFO MESSAGES  ✅ RESTORED
// ─────────────────────────────
const INFO_MESSAGES = {
  bounty: `⚔️ **Bounty Hunting**

Take part in time-limited Pokémon bounties posted by staff and the community.

• Hunt specific Pokémon  
• Submit proof  
• Earn PKD  

Ideal if you enjoy competitive hunting and challenges.`,

  mob: `🧟 **Mob Hunting**

Participate in large-scale Pokémon hunts where many players hunt the same route simultaneously.

• High activity hunts  
• Great for consistent grinders  

Ideal if you enjoy steady farming and teamwork.`,

  witch: `🧙 **Witch Hunting**

Take part in investigation-style gameplay.

• Track players who captured roamers  
• Use Recently Obtained Pokémon data  
• Deduce roamer locations  

Ideal if you enjoy investigation and deduction.`
};

// ─────────────────────────────
// SELECTION STATE (per-user)
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
// UI BUILDERS
// ─────────────────────────────
function buildRoleButton(key, selected) {
  return new ButtonBuilder()
    .setCustomId(`role_${key}`)
    .setLabel(selected ? `✅ ${ROLE_KEYS[key].label}` : ROLE_KEYS[key].label)
    .setStyle(selected ? ButtonStyle.Success : ButtonStyle.Secondary);
}

function buildPanel(client, userId) {
  const selected = getUserSelection(client, userId);

  const embed = new EmbedBuilder()
    .setTitle('Choose your roles')
    .setDescription(
      'Select one or more roles, then press **Confirm**.\n\n' +
      '📝 Roles can be edited later in **#roles**.'
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
// BUTTON HANDLER
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

    // DEV SAFETY
    if (process.env.NODE_ENV !== 'dev') {
      return interaction.reply({
        content: '⚠ Onboarding is disabled.',
        ephemeral: true
      });
    }

    const selection = getUserSelection(client, user.id);

    // ───── YES (open ephemeral panel) ─────
    if (customId === 'onboard_yes') {
      return interaction.reply({
        ...buildPanel(client, user.id),
        ephemeral: true
      });
    }

    // ───── ROLE TOGGLE ─────
    if (customId.startsWith('role_')) {
      const key = customId.replace('role_', '');
      selection.has(key) ? selection.delete(key) : selection.add(key);
      return interaction.update(buildPanel(client, user.id));
    }

    // ───── INFO BUTTONS ─────
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
        content: '❌ Role selection cancelled.',
        embeds: [],
        components: []
      });
    }

    // ───── CONFIRM ─────
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

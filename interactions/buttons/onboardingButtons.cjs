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
   INFO MESSAGES (ORIGINAL — UNCHANGED)
───────────────────────────── */
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

/* ─────────────────────────────
   PANEL BUILDER (DERIVED FROM ROLES)
───────────────────────────── */
function buildPanel(member) {
  const has = roleKey =>
    member.roles.cache.has(process.env[ROLE_KEYS[roleKey].env]);

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
        roleBtn('paradox', has('paradox')),
        roleBtn('roamerMonth', has('roamerMonth')),
        roleBtn('legendary', has('legendary')),
        roleBtn('common', has('common'))
      ),
      new ActionRowBuilder().addComponents(
        roleBtn('bounty', has('bounty')),
        infoBtn('bounty')
      ),
      new ActionRowBuilder().addComponents(
        roleBtn('mob', has('mob')),
        infoBtn('mob')
      ),
      new ActionRowBuilder().addComponents(
        roleBtn('witch', has('witch')),
        infoBtn('witch')
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('roles_confirm')
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('roles_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

function roleBtn(key, active) {
  return new ButtonBuilder()
    .setCustomId(`role_${key}`)
    .setLabel(active ? `✅ ${ROLE_KEYS[key].label}` : ROLE_KEYS[key].label)
    .setStyle(active ? ButtonStyle.Success : ButtonStyle.Secondary);
}

function infoBtn(key) {
  return new ButtonBuilder()
    .setCustomId(`info_${key}`)
    .setLabel('ℹ️ Info')
    .setStyle(ButtonStyle.Primary);
}

/* ─────────────────────────────
   HANDLER
───────────────────────────── */
module.exports = {
  ids: [
    'onboard_yes',
    'onboard_no',
    'roles_open',
    'roles_confirm',
    'roles_cancel',
    ...Object.keys(ROLE_KEYS).map(k => `role_${k}`),
    ...Object.keys(INFO_MESSAGES).map(k => `info_${k}`)
  ],

  async execute(client, interaction) {
    if (process.env.NODE_ENV !== 'dev') return;

    const { customId, member, guild } = interaction;

    /* ACK SAFELY */
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
    }

    /* ───────── YES ───────── */
    if (customId === 'onboard_yes') {
      await member.roles.add(process.env.ROLE_TRAINER).catch(() => {});
      await member.roles.remove(process.env.ROLE_NEW_ARRIVAL).catch(() => {});

      return interaction.editReply({
        content: `✅ You’ve been set as a **Trainer**.\n\nHead to <#${process.env.CHANNEL_ROLES}> to choose notifications.`,
        components: []
      });
    }

    /* ───────── NO ───────── */
    if (customId === 'onboard_no') {
      await member.roles.add(process.env.ROLE_GUEST).catch(() => {});
      await member.roles.remove(process.env.ROLE_NEW_ARRIVAL).catch(() => {});

      return interaction.editReply({
        content: `👋 No problem — you’ve been set as a **Guest**.`,
        components: []
      });
    }

    /* ───────── OPEN PANEL ───────── */
    if (customId === 'roles_open') {
      return interaction.editReply(buildPanel(member));
    }

    /* ───────── TOGGLE ROLE ───────── */
    if (customId.startsWith('role_')) {
      const key = customId.replace('role_', '');
      const roleId = process.env[ROLE_KEYS[key].env];

      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId).catch(() => {});
      } else {
        await member.roles.add(roleId).catch(() => {});
      }

      return interaction.editReply(buildPanel(member));
    }

    /* ───────── INFO ───────── */
    if (customId.startsWith('info_')) {
      return interaction.followUp({
        content: INFO_MESSAGES[customId.replace('info_', '')],
        ephemeral: true
      });
    }

    /* ───────── CONFIRM ───────── */
    if (customId === 'roles_confirm') {
      return interaction.editReply({
        content: '✅ Your roles have been updated.',
        embeds: [],
        components: []
      });
    }

    /* ───────── CANCEL ───────── */
    if (customId === 'roles_cancel') {
      return interaction.editReply({
        content: '❌ Role update cancelled.',
        embeds: [],
        components: []
      });
    }
  }
};
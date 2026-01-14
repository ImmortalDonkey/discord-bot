const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');

const db = require('../../database.cjs');

/**
 * Rarity keys must match core system exactly
 */
const RARITIES = [
  { key: 'paradox', label: 'Paradox' },
  { key: 'roamer_month', label: 'Roamer of the Month' },
  { key: 'legendary', label: 'Legendary' },
  { key: 'rare', label: 'Rare' },
  { key: 'common', label: 'Common' }
];

module.exports = {
  subscriberSafe: true,

  data: new SlashCommandBuilder()
    .setName('reportrouting')
    .setDescription('Configure report channel routing per rarity (subscriber admin only)'),

  async execute(client, interaction) {
    const { guild, member } = interaction;

    if (!guild || !member) {
      return interaction.reply({
        content: '❌ This command must be used inside a server.',
        flags: 64
      });
    }

    // ──────────────────────────────
    // SUBSCRIBER CHECK
    // ──────────────────────────────
    const subscriber = await db.getSubscriberGuild(guild.id);
    if (!subscriber) {
      return interaction.reply({
        content: '❌ This server is not registered as a subscriber.',
        flags: 64
      });
    }

    // ──────────────────────────────
    // ADMIN CHECK
    // ──────────────────────────────
    const hasDiscordAdmin = member.permissions.has('Administrator');

    const memberRoleIds = member.roles.cache.map(r => r.id);
    const hasSubscriberAdmin = await db.isSubscriberStaff(
      guild.id,
      memberRoleIds
    );

    if (!hasDiscordAdmin && !hasSubscriberAdmin) {
      return interaction.reply({
        content: '⛔ You do not have permission to configure report routing.',
        flags: 64
      });
    }

    // ──────────────────────────────
    // BUILD MODAL
    // ──────────────────────────────
    const modal = new ModalBuilder()
      .setCustomId('reportrouting_modal')
      .setTitle('Report Routing Configuration');

    const rows = [];

    for (const rarity of RARITIES) {
      const input = new TextInputBuilder()
        .setCustomId(`channel_${rarity.key}`)
        .setLabel(`${rarity.label} channel ID`)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Leave blank to use default');

      rows.push(new ActionRowBuilder().addComponents(input));
    }

    modal.addComponents(...rows);

    await interaction.showModal(modal);
  }
};

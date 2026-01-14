const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits
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

// OPTIONAL: hard owner override (no DB)
const BOT_OWNERS = new Set([
  'YOUR_DISCORD_ID_HERE'
]);

module.exports = {
  subscriberSafe: true,

  data: new SlashCommandBuilder()
    .setName('reportrouting')
    .setDescription('Configure report channel routing per rarity (subscriber admin only)')
    // hides command from non-admins automatically
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator
    ),

  async execute(client, interaction) {
    const { guild, member, user } = interaction;

    if (!guild || !member) {
      return interaction.reply({
        content: '❌ This command must be used inside a server.',
        flags: 64
      });
    }

    // ──────────────────────────────
    // SUBSCRIBER CHECK (UNCHANGED)
    // ──────────────────────────────
    const subscriber = await db.getSubscriberGuild(guild.id);
    if (!subscriber) {
      return interaction.reply({
        content: '❌ This server is not registered as a subscriber.',
        flags: 64
      });
    }

    // ──────────────────────────────
    // PERMISSION CHECK (DISCORD-NATIVE)
    // ──────────────────────────────
    const hasPermission =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      BOT_OWNERS.has(user.id);

    if (!hasPermission) {
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

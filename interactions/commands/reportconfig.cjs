// interactions/commands/reportconfig.cjs

const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const db = require('../../database.cjs');
const {
  CARD_OUTLINE_PRESETS,
  resolveOutlineColor
} = require('../../utils/reportCardPresets.cjs');

module.exports = {
  // 🌍 SUBSCRIBER SAFE
  // Global command + instant main guild availability
  subscriberSafe: true,

  data: new SlashCommandBuilder()
    .setName('reportconfig')
    .setDescription('Configure how your report cards look')

    .addStringOption(option =>
      option
        .setName('colour')
        .setDescription('Preset name or hex code (#RRGGBB)')
        .setRequired(false)
        .setAutocomplete(true)
    )

    .addStringOption(option =>
      option
        .setName('hex')
        .setDescription('Optional custom hex colour (overrides preset)')
        .setRequired(false)
    )

    .addBooleanOption(option =>
      option
        .setName('remove')
        .setDescription('Remove custom styling and revert to default')
        .setRequired(false)
    ),

  async execute(client, interaction) {
    const discordId = interaction.user.id;

    const remove = interaction.options.getBoolean('remove');
    const presetInput = interaction.options.getString('colour');
    const hexInput = interaction.options.getString('hex');

    // ──────────────────────────────
    // REMOVE / RESET USER PREFS
    // ──────────────────────────────
    if (remove) {
      await db.clearReportCardPrefs(discordId);

      const embed = new EmbedBuilder()
        .setTitle('♻️ Report Card Reset')
        .setDescription(
          `Your custom report card styling has been removed.\n\n` +
          `Cards will now use:\n` +
          `• Rarity-based outline colours\n` +
          `• Default text styling`
        )
        .setColor(0x9ca3af);

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // ──────────────────────────────
    // VALIDATE INPUT
    // ──────────────────────────────
    if (!presetInput && !hexInput) {
      return interaction.reply({
        content:
          '❌ You must provide a colour preset, hex code, or use `remove:true`.',
        ephemeral: true
      });
    }

    // Resolve colour priority: hex > preset
    const resolvedColor =
      resolveOutlineColor(hexInput) ||
      resolveOutlineColor(presetInput);

    if (!resolvedColor) {
      return interaction.reply({
        content:
          '❌ Invalid colour. Use a preset or a hex code like `#ff0000`.',
        ephemeral: true
      });
    }

    // ──────────────────────────────
    // SAVE PREF
    // ──────────────────────────────
    await db.setReportCardPrefs(discordId, {
      outline_color: resolvedColor
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Report Card Updated')
      .setDescription(
        `Your report card outline colour has been set to:\n\n` +
        `**${resolvedColor}**\n\n` +
        `This applies to:\n` +
        `• Route bar outline\n` +
        `• Main text box outline`
      )
      .setColor(resolvedColor);

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};

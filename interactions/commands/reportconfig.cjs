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
  data: new SlashCommandBuilder()
    .setName('reportconfig')
    .setDescription('Configure how your report cards look')

    .addStringOption(option =>
      option
        .setName('colour')
        .setDescription('Preset name or hex code (#RRGGBB)')
        .setRequired(true)
        .setAutocomplete(true)
    )

    .addStringOption(option =>
      option
        .setName('hex')
        .setDescription('Optional custom hex colour (overrides preset)')
        .setRequired(false)
    ),

  async execute(client, interaction) {
    const discordId = interaction.user.id;

    const presetInput = interaction.options.getString('colour');
    const hexInput = interaction.options.getString('hex');

    // Resolve colour priority: hex > preset
    const resolvedColor =
      resolveOutlineColor(hexInput) ||
      resolveOutlineColor(presetInput);

    if (!resolvedColor) {
      return interaction.reply({
        content: '❌ Invalid colour. Use a preset or a hex code like `#ff0000`.',
        ephemeral: true
      });
    }

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
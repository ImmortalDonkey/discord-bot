const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const db = require('../../database.cjs');

/* ------------------------------------------------------
 * CARD OUTLINE PRESETS (authoritative)
 * ------------------------------------------------------ */

const CARD_OUTLINE_PRESETS = {
  // ── Core / Neutral ──
  white: "#ffffff",
  silver: "#e5e7eb",
  slate: "#94a3b8",
  black: "#0f172a",

  // ── Cool tones ──
  blue: "#38bdf8",
  sky: "#7dd3fc",
  cyan: "#22d3ee",
  teal: "#2dd4bf",
  indigo: "#818cf8",

  // ── Warm tones ──
  red: "#ef4444",
  orange: "#fb923c",
  amber: "#f59e0b",
  gold: "#facc15",
  yellow: "#fde047",

  // ── Greens ──
  green: "#4ade80",
  emerald: "#34d399",
  lime: "#a3e635",

  // ── Pinks / Purples ──
  pink: "#ec4899",
  rose: "#fb7185",
  purple: "#a855f7",
  violet: "#c084fc",
  magenta: "#e879f9",

  // ── Special / Themed ──
  paradox: "#a855f7",
  legendary: "#22d3ee",
  mythic: "#f472b6",
  shadow: "#64748b",
  crystal: "#67e8f9",
  neon: "#22ff88"
};

/**
 * Resolve a user-supplied outline color.
 * Accepts:
 *  - preset key (case-insensitive)
 *  - hex code (#rrggbb)
 * Returns:
 *  - resolved hex string
 *  - null if invalid
 */
function resolveOutlineColor(input) {
  if (!input) return null;

  const value = String(input).trim().toLowerCase();

  if (CARD_OUTLINE_PRESETS[value]) {
    return CARD_OUTLINE_PRESETS[value];
  }

  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reportconfig')
    .setDescription('Configure how your report cards look')

    .addStringOption(option =>
      option
        .setName('colour')
        .setDescription('Preset name or hex code (#RRGGBB)')
        .setRequired(true)
        .addChoices(
          ...Object.keys(CARD_OUTLINE_PRESETS).map(key => ({
            name: key,
            value: key
          }))
        )
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
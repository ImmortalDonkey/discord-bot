const CARD_OUTLINE_PRESETS = {
  // ── Core / Neutral (4) ──
  white: "#ffffff",
  silver: "#e5e7eb",
  slate: "#94a3b8",
  black: "#0f172a",

  // ── Cool tones (6) ──
  blue: "#38bdf8",
  sky: "#7dd3fc",
  cyan: "#22d3ee",
  teal: "#2dd4bf",
  indigo: "#818cf8",
  violet: "#c084fc",

  // ── Warm tones (6) ──
  red: "#ef4444",
  orange: "#fb923c",
  amber: "#f59e0b",
  gold: "#facc15",
  yellow: "#fde047",
  rose: "#fb7185",

  // ── Greens (3) ──
  green: "#4ade80",
  emerald: "#34d399",
  lime: "#a3e635",

  // ── Special / Themed (6) ──
  paradox: "#a855f7",        // matches paradox rarity
  legendary: "#22d3ee",      // matches legendary rarity
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

  // Preset match
  if (CARD_OUTLINE_PRESETS[value]) {
    return CARD_OUTLINE_PRESETS[value];
  }

  // Hex validation
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }

  return null;
}

module.exports = {
  CARD_OUTLINE_PRESETS,
  resolveOutlineColor
};
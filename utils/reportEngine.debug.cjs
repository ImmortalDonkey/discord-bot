// utils/reportEngine.debug.cjs
// ------------------------------------------------------
// DEBUG Report Engine (single-file util)
// - Used by /reportdebug to avoid touching live /report logic
// - Integrates with:
//   - database.cjs (createReport + players + player_guilds)
//   - reportLimiter.cjs (optional duplicate blocking)
//   - validation.cjs (optional strong validation)
//   - reportChannelRouter.cjs (routing channel + role per rarity)
//   - renderers/reportCard.cjs (card generation)
// ------------------------------------------------------

const db = require("../database.cjs");

const { getRankName } = require("./rankSystem.cjs");
const { getRarity, getRarityDisplayLabel } = require("./rarity.cjs");
const { calculateAwardedPoints } = require("./scoring.cjs");

const { createReportCard } = require("../renderers/reportCard.cjs");
const { getChannelForRarity, getRoleForRarity } = require("./reportChannelRouter.cjs");

// Optional integrations (don’t hard-crash if missing)
let checkReportAllowed = null;
try {
  ({ checkReportAllowed } = require("./reportLimiter.cjs"));
} catch {}

let isValidPokemon = null;
let isValidLocation = null;
try {
  ({ isValidPokemon, isValidLocation } = require("./validation.cjs"));
} catch {}

const DEFAULT_DEBUG_REPORT_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

/**
 * Safely fetch a text channel by ID on a guild.
 */
async function fetchChannelSafe(guild, channelId) {
  if (!guild || !channelId) return null;
  return await guild.channels.fetch(channelId).catch(() => null);
}

/**
 * Resolve where to post:
 * - Router first (rarity based)
 * - Fallback: REPORT_CARD_CHANNEL_ID
 */
async function resolveTargetChannel(guild, rarityKey, fallbackChannelId = null) {
  let targetChannel = null;
  let targetChannelId = null;

  const routedChannelId = getChannelForRarity(rarityKey);
  if (routedChannelId) {
    targetChannel = await fetchChannelSafe(guild, routedChannelId);
    if (targetChannel) targetChannelId = routedChannelId;
  }

  if (!targetChannel) {
    const fb = fallbackChannelId || DEFAULT_DEBUG_REPORT_CHANNEL_ID;
    if (fb) {
      targetChannel = await fetchChannelSafe(guild, fb);
      if (targetChannel) targetChannelId = fb;
    }
  }

  return { targetChannel, targetChannelId };
}

/**
 * Compute expiry (end of current hour) + deleteAt (24h after expiry)
 */
function computeExpiryWindow(now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setMinutes(59, 59, 999);
  const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;
  return { expiresAt, deleteAt };
}

/**
 * Staff check helper
 */
function isStaff(member, staffRoleIds = []) {
  if (!member || !member.roles) return false;
  if (!Array.isArray(staffRoleIds) || staffRoleIds.length === 0) return false;
  return member.roles.cache.some(r => staffRoleIds.includes(r.id));
}

/**
 * Main debug report flow:
 * - optionally validate pokemon/route
 * - optionally block duplicates (reportLimiter)
 * - award points
 * - render card
 * - post to target channel
 * - save to DB
 * - touch player profile + guild tracking
 *
 * Options:
 * {
 *   staffRoleIds: string[],
 *   fallbackChannelId: string,
 *   allowDuplicates: boolean,
 *   validateInputs: boolean,
 *   reasonPrefix: string
 * }
 */
async function runDebugReport(client, interaction, options = {}) {
  const user = interaction.user;
  const member = interaction.member;
  const guild = interaction.guild;

  const staffRoleIds = options.staffRoleIds || [];
  const fallbackChannelId = options.fallbackChannelId || DEFAULT_DEBUG_REPORT_CHANNEL_ID;

  const allowDuplicates =
    typeof options.allowDuplicates === "boolean"
      ? options.allowDuplicates
      : (process.env.DEBUG_ALLOW_DUPLICATE_REPORTS === "1");

  const validateInputs =
    typeof options.validateInputs === "boolean"
      ? options.validateInputs
      : (process.env.DEBUG_VALIDATE_REPORT_INPUTS !== "0"); // default ON

  const reasonPrefix = options.reasonPrefix || "Debug Report";

  // STAFF ONLY (for /reportdebug)
  if (!isStaff(member, staffRoleIds)) {
    return {
      ok: false,
      errorMessage: "⛔ Staff-only test command.",
      flags: 64
    };
  }

  const pokemon = interaction.options.getString("pokemon");
  const route = interaction.options.getString("route");

  // Optional strong validation (if validation.cjs exists)
  if (validateInputs) {
    if (typeof isValidPokemon === "function" && !isValidPokemon(pokemon)) {
      return {
        ok: false,
        errorMessage: `❌ **"${pokemon}"** is not a valid Pokémon.\nPlease choose from the autocomplete list.`,
        flags: 64
      };
    }
    if (typeof isValidLocation === "function" && !isValidLocation(route)) {
      return {
        ok: false,
        errorMessage: `❌ **"${route}"** is not a valid Route.\nPlease select using the autocomplete list.`,
        flags: 64
      };
    }
  }

  // RARITY + POINTS
  const rarityKey = getRarity(pokemon);
  const rarityLabel = getRarityDisplayLabel(rarityKey);

  // Duplicate blocking (optional)
  if (!allowDuplicates && typeof checkReportAllowed === "function") {
    const allowedInfo = await checkReportAllowed(pokemon, new Date());
    if (!allowedInfo.allowed) {
      const extra =
        allowedInfo.nextResetLabel
          ? `\nNext reset: ${allowedInfo.nextResetLabel}`
          : "";

      return {
        ok: false,
        errorMessage: `🚫 Duplicate report blocked (**${allowedInfo.reason || "duplicate"}**) — **${pokemon}** already reported this hour.${extra}`,
        flags: 64,
        blocked: true
      };
    }
  }

  const now = new Date();
  const points = calculateAwardedPoints(rarityKey, now);

  const updatedUser = await db.addPoints(
    user.id,
    user.username,
    points,
    `${reasonPrefix}: ${pokemon}`
  );

  const trainerRank = getRankName(updatedUser?.lifetime_points || 0);
  const trainerName =
    member?.displayName ||
    member?.nickname ||
    user?.globalName ||
    user?.username;

  // EXPIRY WINDOW
  const { expiresAt, deleteAt } = computeExpiryWindow(now);

  const reportId = `report_${Date.now()}_${user.id}`;

  // BUILD CARD IMAGE
  const cardPath = await createReportCard({
    trainerName,
    trainerRank,
    pokemonName: pokemon,
    rarityKey,
    rarityLabel,
    points,
    location: route,
    statusText: "Active"
  });

  // ROUTE CHANNEL
  const { targetChannel, targetChannelId } = await resolveTargetChannel(
    guild,
    rarityKey,
    fallbackChannelId
  );

  if (!targetChannel) {
    return {
      ok: false,
      errorMessage:
        "❌ No valid report channel found. Please configure rarity channels or REPORT_CARD_CHANNEL_ID.",
      flags: 64
    };
  }

  // Role ping from router (if configured)
  const roleId = getRoleForRarity(rarityKey);
  const mentions = [`<@${user.id}>`];
  if (roleId) mentions.push(`<@&${roleId}>`);

  // BUTTONS (Edit / Delete)
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`reportedit_${reportId}`)
      .setLabel("✏ Edit")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`reportdelete_${reportId}`)
      .setLabel("🗑 Delete")
      .setStyle(ButtonStyle.Danger)
  );

  // SEND CARD MESSAGE
  const sent = await targetChannel.send({
    content: mentions.join(" "),
    files: [cardPath],
    components: [controls]
  });

  // DB SAVE (reports)
  await db.createReport({
    id: reportId,
    guildId: guild.id,
    reporterId: user.id,
    reporterName: trainerName,
    pokemonName: pokemon,
    rarityKey,
    rarityLabel,
    location: route,
    trainerRank,
    points,
    status: "active",
    channelId: sent.channelId,
    messageId: sent.id,
    imagePath: cardPath,
    expiresAt: expiresAt.getTime(),
    deleteAt,
    createdAt: now.getTime()
  });

  // Player profile + guild tracking (new DB features)
  // - ign optional (not set here)
  if (typeof db.upsertPlayerProfile === "function") {
    await db.upsertPlayerProfile({
      discordId: user.id,
      username: user.username,
      nickname: trainerName
    });
  }
  if (typeof db.touchPlayerGuild === "function") {
    await db.touchPlayerGuild(user.id, guild.id);
  }

  return {
    ok: true,
    reportId,
    targetChannelId,
    expiresAt,
    points,
    rarityKey,
    rarityLabel
  };
}

module.exports = {
  runDebugReport,
  resolveTargetChannel,
  computeExpiryWindow
};
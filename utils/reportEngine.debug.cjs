// utils/reportEngine.debug.cjs
// ------------------------------------------------------
// DEBUG-ONLY REPORT ENGINE
// Implements locked encounter/sighting flow
// Used exclusively by /reportdebug
// ------------------------------------------------------

const db = require("../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("./rarity.cjs");
const { calculateAwardedPoints } = require("./scoring.cjs");
const { getRankName } = require("./rankSystem.cjs");
const { checkReportAllowed } = require("./reportLimiter.cjs");

// NOTE: backend channel ID where Vortex bot listens
const VORTEX_BACKEND_CHANNEL_ID = process.env.VORTEX_BACKEND_CHANNEL_ID;

// ------------------------------------------------------
// Helpers
// ------------------------------------------------------

function isEncounter(idOrIgn) {
  return typeof idOrIgn === "string" && idOrIgn.startsWith("#");
}

function normalizeIgn(str) {
  return String(str || "").trim();
}

// ------------------------------------------------------
// VORTEX VERIFICATION (DEBUG)
// ------------------------------------------------------
async function verifyPokemonId(client, guild, pokemonId) {
  const channel = await guild.channels
    .fetch(VORTEX_BACKEND_CHANNEL_ID)
    .catch(() => null);

  if (!channel) {
    return { ok: false, reason: "backend-channel-missing" };
  }

  // Send command to vortex bot
  const sent = await channel.send(`!id ${pokemonId}`);

  // Await vortex response (simple collector)
  const collected = await channel.awaitMessages({
    filter: m =>
      m.author.id !== client.user.id &&
      m.embeds?.length &&
      m.embeds[0]?.title?.includes(pokemonId),
    max: 1,
    time: 10_000
  });

  if (!collected.size) {
    return { ok: false, reason: "vortex-timeout" };
  }

  const msg = collected.first();
  const embed = msg.embeds[0];

  // ⚠️ This parsing assumes current Vortex embed format
  const description = embed.description || "";

  // Example expected line:
  // Trainer: SomeIGN
  const trainerLine = description
    .split("\n")
    .find(l => l.toLowerCase().startsWith("trainer"));

  if (!trainerLine) {
    return { ok: false, reason: "trainer-not-found" };
  }

  const trainerIgn = trainerLine.split(":").slice(1).join(":").trim();

  return {
    ok: true,
    trainerIgn,
    pokemonName: embed.title || null
  };
}

// ------------------------------------------------------
// MAIN DEBUG EXECUTION
// ------------------------------------------------------

async function executeDebugReport({
  client,
  guild,
  reporterUser,
  reporterMember,
  pokemon,
  route,
  idOrIgn,
  now = new Date()
}) {
  const flowIsEncounter = isEncounter(idOrIgn);

  // --------------------------------------------------
  // FLOW VALIDATION
  // --------------------------------------------------

  const reporterRow = await db.getUserById(reporterUser.id);
  const reporterIgn = reporterRow?.username || null; // placeholder until /ign exists

  if (flowIsEncounter && !reporterIgn) {
    return {
      ok: false,
      error:
        "You must register your IGN using `/ign` before submitting encounter reports."
    };
  }

  if (!flowIsEncounter && !idOrIgn) {
    return {
      ok: false,
      error: "You must provide an IGN for sighting reports."
    };
  }

  // --------------------------------------------------
  // DUPLICATE LIMITING
  // --------------------------------------------------
  const limitCheck = await checkReportAllowed(pokemon, now);
  if (!limitCheck.allowed) {
    return {
      ok: false,
      error: `This Pokémon was already reported this hour.\nNext reset ${limitCheck.nextResetLabel}`
    };
  }

  // --------------------------------------------------
  // VERIFICATION + OWNERSHIP
  // --------------------------------------------------
  let finalType = "sighting";
  let encounterIgn = null;
  let encounterUserId = null;
  let pointsRecipientId = reporterUser.id;
  let pointsMultiplier = 0.5;

  if (flowIsEncounter) {
    const verify = await verifyPokemonId(client, guild, idOrIgn);

    if (!verify.ok) {
      return {
        ok: false,
        error: `Failed to verify Pokémon ID (${verify.reason}).`
      };
    }

    encounterIgn = normalizeIgn(verify.trainerIgn);

    if (
      encounterIgn.toLowerCase() !== reporterIgn.toLowerCase()
    ) {
      return {
        ok: false,
        error:
          "The Pokémon ID does not belong to your registered IGN."
      };
    }

    finalType = "encounter";
    encounterUserId = reporterUser.id;
    pointsRecipientId = reporterUser.id;
    pointsMultiplier = 1;
  } else {
    encounterIgn = normalizeIgn(idOrIgn);

    const ownerRow = await db.getUserByUsername(encounterIgn);

    if (ownerRow) {
      finalType = "encounter";
      encounterUserId = ownerRow.discord_id;
      pointsRecipientId = ownerRow.discord_id;
      pointsMultiplier = 1;
    }
  }

  // --------------------------------------------------
  // POINTS + RANK
  // --------------------------------------------------
  const rarityKey = getRarity(pokemon);
  const rarityLabel = getRarityDisplayLabel(rarityKey);

  const basePoints = calculateAwardedPoints(rarityKey, now);
  const awardedPoints = Math.floor(basePoints * pointsMultiplier);

  let updatedRecipient = null;
  let trainerRank = "Trainer";

  if (awardedPoints > 0) {
    updatedRecipient = await db.addPoints(
      pointsRecipientId,
      encounterIgn || reporterUser.username,
      awardedPoints,
      `Report (${finalType})`
    );

    trainerRank = getRankName(
      updatedRecipient?.lifetime_points || 0
    );
  }

  // --------------------------------------------------
  // EXPIRY
  // --------------------------------------------------
  const expiresAt = new Date(now);
  expiresAt.setMinutes(59, 59, 999);
  const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

  // --------------------------------------------------
  // RENDER INTENT
  // --------------------------------------------------
  const displayName =
    finalType === "encounter"
      ? encounterIgn
      : reporterMember.displayName;

  const narrativeText =
    finalType === "encounter"
      ? `${displayName} encountered a wild ${pokemon} on ${route}`
      : `${reporterMember.displayName} reported that ${encounterIgn} encountered a wild ${pokemon}`;

  return {
    ok: true,

    finalType,
    narrativeText,

    highlight: {
      text:
        finalType === "encounter"
          ? displayName
          : encounterIgn,
      type: finalType === "encounter" ? "owner" : "ign"
    },

    pokemonName: pokemon,
    route,
    rarityKey,
    rarityLabel,

    pointsAwarded: awardedPoints,
    pointsRecipientId,

    trainerRank,

    expiresAt: expiresAt.getTime(),
    deleteAt
  };
}

module.exports = {
  executeDebugReport
};
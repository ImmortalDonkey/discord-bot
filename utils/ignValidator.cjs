// utils/ignValidator.cjs
// ------------------------------------------------------
// IGN validation & resolution helpers
//
// Responsibilities:
// - Distinguish IGN vs Pokémon ID input
// - Resolve IGN → registered Discord player (if exists)
// - Enforce rules for encounter vs sighting reports
//
// This file contains NO Discord logic.
// ------------------------------------------------------

const db = require("../database.cjs");

/**
 * Determine whether the third /report argument is:
 * - Pokémon ID (encounter)
 * - IGN (sighting)
 *
 * Rules:
 * - Pokémon IDs are prefixed with '#'
 * - IGN can never contain '#'
 */
function classifyReportTarget(input) {
  if (!input) {
    return { type: "unknown" };
  }

  const raw = String(input).trim();

  if (raw.startsWith("#")) {
    return {
      type: "pokemon-id",
      pokemonId: raw
    };
  }

  return {
    type: "ign",
    ign: raw
  };
}

/**
 * Resolve an IGN to a registered player, if one exists.
 *
 * Returns:
 * {
 *   found: boolean,
 *   player: row | null
 * }
 */
async function resolveIgnOwner(ign) {
  if (!ign) {
    return { found: false, player: null };
  }

  const player = await db.getPlayerByIgn(ign);

  if (!player) {
    return { found: false, player: null };
  }

  return {
    found: true,
    player
  };
}

/**
 * Validate whether a user is allowed to submit
 * an encounter report.
 *
 * Encounter rules:
 * - Pokémon ID is required
 * - Reporting user MUST have a linked IGN
 */
async function validateEncounterReport({ reporterDiscordId }) {
  const profile = await db.getPlayerByDiscordId(reporterDiscordId);

  if (!profile || !profile.ign) {
    return {
      allowed: false,
      reason: "missing-ign"
    };
  }

  return {
    allowed: true,
    ign: profile.ign,
    profile
  };
}

/**
 * Validate a sighting report and determine
 * whether it should be upgraded to an encounter.
 *
 * Rules:
 * - IGN must be supplied
 * - If IGN belongs to a registered player:
 *     → Upgrade to encounter (owner gets credit)
 * - Otherwise:
 *     → True sighting (50% points)
 */
async function validateSightingReport({ ign }) {
  if (!ign) {
    return {
      allowed: false,
      reason: "missing-ign"
    };
  }

  const resolved = await resolveIgnOwner(ign);

  if (resolved.found) {
    return {
      allowed: true,
      upgradedToEncounter: true,
      ownerProfile: resolved.player
    };
  }

  return {
    allowed: true,
    upgradedToEncounter: false,
    ownerProfile: null
  };
}

module.exports = {
  classifyReportTarget,
  resolveIgnOwner,
  validateEncounterReport,
  validateSightingReport
};
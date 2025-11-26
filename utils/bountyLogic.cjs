// utils/bountyLogic.cjs
// PURE LOGIC ONLY — no Discord actions

// ------------------------------
// In-memory storage
// ------------------------------
const pendingBounties = new Map();   // bountyId -> bountyData
const activeBounties = new Map();    // bountyId -> bountyData
const bountyClaims = new Map();      // claimId  -> claimData

// ------------------------------
// Import helpers
// ------------------------------
const { getHighestRarityForList, getRarityDisplayLabel } = require('./rarity.cjs');
const { clampHours, parseHourFromStartTimeString, getNextOccurrenceOfHour } = require('./timeUtils.cjs');

// ------------------------------
// Bounty Object Builders
// ------------------------------

/**
 * Create a bounty object exactly matching index.cjs behaviour.
 */
function buildBounty({
  requesterId,
  requesterName,
  pokemons,
  notes,
  startTimeStr,
  durationHoursRaw,
  reward
}) {
  const durationHours = clampHours(durationHoursRaw);
  const durationMs = durationHours * 3600 * 1000;

  // determine start time
  let startTime;
  if (startTimeStr === 'now') {
    startTime = new Date();
  } else {
    const hour = parseHourFromStartTimeString(startTimeStr);
    startTime = getNextOccurrenceOfHour(hour);
  }

  const endTime = new Date(startTime.getTime() + durationMs);

  const bountyId = `${Date.now()}_${requesterId}`;

  return {
    id: bountyId,
    requesterId,
    requesterName,
    pokemons,
    notes,
    startTime,
    endTime,
    durationHours,
    reward,
    createdAt: new Date(),
    startsNow: startTimeStr === 'now',
    approved: false,
    completed: false,
    channelId: null,
    messageId: null,
    winnerId: null,
    winnerName: null
  };
}

// ------------------------------
// Claim Object Builder
// ------------------------------

function buildClaim({
  bountyId,
  claimerId,
  claimerName,
  proof
}) {
  return {
    id: `${bountyId}_${claimerId}_${Date.now()}`,
    bountyId,
    claimerId,
    claimerName,
    proof,
    createdAt: new Date(),
    status: 'pending',
    threadId: null
  };
}

// ------------------------------
// Staff Permissions
// ------------------------------

function isStaff(member, staffRoles) {
  if (!staffRoles || !Array.isArray(staffRoles)) return false;
  const memberRoles = member.roles.cache.map(r => r.id);
  return staffRoles.some(r => memberRoles.includes(r));
}

// ------------------------------
// Lookups
// ------------------------------

function getBounty(id) {
  return activeBounties.get(id) || pendingBounties.get(id) || null;
}

function getPendingBounty(id) {
  return pendingBounties.get(id) || null;
}

function getActiveBounty(id) {
  return activeBounties.get(id) || null;
}

function getClaim(id) {
  return bountyClaims.get(id) || null;
}

// ------------------------------
// Mutations
// ------------------------------

function addPendingBounty(bounty) {
  pendingBounties.set(bounty.id, bounty);
}

function approvePendingBounty(id) {
  const bounty = pendingBounties.get(id);
  if (!bounty) return null;

  pendingBounties.delete(id);
  bounty.approved = true;
  activeBounties.set(id, bounty);

  return bounty;
}

function denyPendingBounty(id) {
  return pendingBounties.delete(id);
}

function completeBounty(id, winnerId, winnerName) {
  const bounty = activeBounties.get(id);
  if (!bounty) return null;

  bounty.completed = true;
  bounty.winnerId = winnerId;
  bounty.winnerName = winnerName;

  activeBounties.set(id, bounty);
  return bounty;
}

function finishExpiredBounty(id) {
  return activeBounties.delete(id);
}

function storeClaim(claim) {
  bountyClaims.set(claim.id, claim);
}

function updateClaim(claimId, updates) {
  const claim = bountyClaims.get(claimId);
  if (!claim) return null;

  Object.assign(claim, updates);
  bountyClaims.set(claimId, claim);
  return claim;
}

// ------------------------------
// Rarity + Display Shortcuts
// ------------------------------

function getBountyRarity(pokemons) {
  return getHighestRarityForList(pokemons);
}

function getBountyRarityLabel(pokemons) {
  const key = getHighestRarityForList(pokemons);
  return getRarityDisplayLabel(key);
}

// ------------------------------
// Exports
// ------------------------------
module.exports = {
  // stores
  pendingBounties,
  activeBounties,
  bountyClaims,

  // builders
  buildBounty,
  buildClaim,

  // lookup
  getBounty,
  getPendingBounty,
  getActiveBounty,
  getClaim,

  // modifiers
  addPendingBounty,
  approvePendingBounty,
  denyPendingBounty,
  completeBounty,
  finishExpiredBounty,
  storeClaim,
  updateClaim,

  // rarity helpers
  getBountyRarity,
  getBountyRarityLabel,

  // staff helper
  isStaff
};


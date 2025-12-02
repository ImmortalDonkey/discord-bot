// utils/bountyStore.cjs

/**
 * Simple in-memory store for bounties.
 *
 * Shape of a bounty object (all camelCase):
 * {
 *   id: string,
 *   guildId: string,
 *   requesterId: string,
 *   requesterName: string,
 *   pokemons: string[],
 *   notes: string,
 *   startTime: number,        // ms
 *   endTime: number,          // ms
 *   durationHours: number,
 *   reward: number,
 *   rarityKey: string,
 *   rarityLabel: string,
 *   startsImmediately: boolean,
 *   status: 'pending' | 'open' | 'rejected' | 'completed' | 'expired',
 *   createdAt: number,
 *   approvedAt: number | null,
 *   requestThreadId: string | null,
 *   requestMessageId: string | null,
 *   announcementChannelId: string | null,
 *   announcementMessageId: string | null,
 *   cardChannelId: string | null,
 *   cardMessageId: string | null,
 *   winnerId: string | null,
 *   winnerClaimId: number | null
 * }
 */

const bounties = new Map();

/**
 * Create + store a bounty (or overwrite existing same id).
 */
function saveBounty(bounty) {
  if (!bounty || !bounty.id) {
    throw new Error('saveBounty requires bounty.id');
  }
  bounties.set(bounty.id, { ...bounty });
  return bounties.get(bounty.id);
}

/**
 * Get a bounty by id.
 */
function getBountyById(id) {
  if (!id) return null;
  return bounties.get(id) || null;
}

/**
 * Update a bounty by id with a partial patch.
 */
function updateBounty(id, patch = {}) {
  const existing = bounties.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  bounties.set(id, updated);
  return updated;
}

/**
 * Remove bounty completely.
 */
function deleteBounty(id) {
  bounties.delete(id);
}

/**
 * Get all bounties as an array.
 */
function getAllBounties() {
  return Array.from(bounties.values());
}

/**
 * For scheduler: bounties that need to start.
 * (no card yet, startTime <= now, status === 'open')
 */
function getBountiesToStart(nowMs) {
  return getAllBounties().filter(b =>
    b.status === 'open' &&
    typeof b.startTime === 'number' &&
    b.startTime <= nowMs &&
    (!b.cardMessageId || !b.cardChannelId)
  );
}

/**
 * For scheduler: bounties that need to expire.
 * (card exists, endTime <= now, status === 'open')
 */
function getBountiesToExpire(nowMs) {
  return getAllBounties().filter(b =>
    b.status === 'open' &&
    typeof b.endTime === 'number' &&
    b.endTime <= nowMs &&
    !!b.cardMessageId &&
    !!b.cardChannelId
  );
}

/**
 * For debugging or /activebounties style commands.
 */
function getActiveBounties() {
  return getAllBounties().filter(b => b.status === 'open');
}

module.exports = {
  saveBounty,
  getBountyById,
  updateBounty,
  deleteBounty,
  getAllBounties,
  getBountiesToStart,
  getBountiesToExpire,
  getActiveBounties
};
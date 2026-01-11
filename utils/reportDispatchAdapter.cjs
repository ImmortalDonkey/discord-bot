/**
 * utils/reportDispatchAdapter.cjs
 *
 * Adapter for Vortex watcher → handler.
 * This MUST stay separate from the legacy dispatchReport contract.
 */

function dispatchVortexRoamer(client, roamer) {
  // Lazy-load to avoid circular dependency
  const { handleVortexRoamer } = require('./reportDispatcher.cjs');

  if (!client) {
    console.warn('⚠ dispatchVortexRoamer called without client');
    return;
  }

  if (!roamer) {
    console.warn('⚠ dispatchVortexRoamer called without roamer payload');
    return;
  }

  return handleVortexRoamer(client, roamer);
}

module.exports = {
  dispatchVortexRoamer
};
/**
 * utils/reportDispatchAdapter.cjs
 *
 * Adapter for Vortex watcher → Vortex handler.
 * This MUST stay separate from the legacy dispatchReport contract.
 */

function dispatchVortexRoamer(client, roamer) {
  // ✅ LAZY REQUIRE (CRITICAL – avoids circular deps)
  const { handleVortexRoamer } = require('./vortexRoamerHandler.cjs');

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
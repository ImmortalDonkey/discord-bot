/**
 * utils/reportDispatchAdapter.cjs
 *
 * Adapter layer to avoid circular dependency.
 * MUST preserve dispatcher function signature.
 */

function dispatchReport(client, roamer) {
  const { handleVortexRoamer } = require('./reportDispatcher.cjs');

  // 🔒 Guard (prevents crashes + better logs)
  if (!roamer) {
    console.warn('⚠ dispatchReport called without roamer payload');
    return;
  }

  return handleVortexRoamer(client, roamer);
}

module.exports = {
  dispatchReport
};
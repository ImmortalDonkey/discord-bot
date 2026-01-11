/**
 * utils/reportDispatchAdapter.cjs
 *
 * Purpose:
 * Break circular dependency between vortexRoamerHandler
 * and reportDispatcher by lazy-loading the dispatcher.
 *
 * This file MUST stay dependency-light.
 */

function dispatchReport(...args) {
  const { handleVortexRoamer } = require('./reportDispatcher.cjs');
  return handleVortexRoamer(...args);
}

module.exports = {
  dispatchReport
};
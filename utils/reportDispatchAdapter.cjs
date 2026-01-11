/**
 * utils/reportDispatchAdapter.cjs
 *
 * Purpose:
 * Break circular dependency between vortexRoamerHandler
 * and reportDispatcher by lazy-loading dispatchReport.
 *
 * This file MUST stay dependency-light.
 */

/**
 * Lazy dispatch adapter
 * Resolves reportDispatcher only at call time
 */
function dispatchReport(...args) {
  const { dispatchReport } = require('./reportDispatcher.cjs');
  return dispatchReport(...args);
}

module.exports = {
  dispatchReport
};
/**
 * utils/reportDispatchAdapter.cjs
 *
 * Thin adapter to break circular dependency between:
 * - vortexRoamerHandler.cjs
 * - reportDispatcher.cjs
 *
 * DO NOT add logic here.
 * This file exists purely for architectural isolation.
 */

const { dispatchReport } = require('./reportDispatcher.cjs');

module.exports = {
  dispatchReport
};
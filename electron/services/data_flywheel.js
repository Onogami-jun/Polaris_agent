/**
 * Polaris Data Flywheel — proxy
 * Internal: internal/services/data_flywheel.js (full impl)
 * Public:   no-op stubs — silently skip data recording
 */
var path = require('path'); var fs = require('fs');
var internalPath = path.join(__dirname, '..', '..', 'internal', 'services', 'data_flywheel.js');
if (fs.existsSync(internalPath)) { module.exports = require(internalPath); } else {
  function noop() {}
  module.exports = {
    recordDPOPair: noop, recordVerification: noop, recordRouting: noop,
    recordHallucination: noop, getDatasetStats: function() { return {}; },
    exportDataset: function() { return { success: false, error: 'internal module not available' }; },
  };
}

/**
 * Polaris Semantic DSL — proxy
 * Internal: internal/services/semantic_dsl.js (BARRIER 7)
 * Public:   passthrough stub
 */
var path = require('path'); var fs = require('fs');
var internalPath = path.join(__dirname, '..', '..', 'internal', 'services', 'semantic_dsl.js');
if (fs.existsSync(internalPath)) { module.exports = require(internalPath); } else {
  module.exports = {
    parseFromLLM: function(output, msg) { return { valid: false, error: 'internal module not available', raw: (output||'').slice(0,200) }; },
    validate: function(instance, msg) { return { valid: false, error: 'stub' }; },
    generatePython: function(instance) { return null; },
    SCHEMAS: {},
  };
}

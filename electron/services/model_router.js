/**
 * Polaris Model Router — proxy
 * Internal: internal/services/model_router.js (BARRIER 9)
 * Public:   always routes to deepseek-v4-flash
 */
var path = require('path'); var fs = require('fs');
var internalPath = path.join(__dirname, '..', '..', 'internal', 'services', 'model_router.js');
if (fs.existsSync(internalPath)) { module.exports = require(internalPath); } else {
  module.exports = {
    MODELS: { 'deepseek-v4-flash': { provider: 'deepseek', costPer1k: 0.0014, latency: 'fast', maxTokens: 4096, local: false, available: true } },
    route: function(pt, strategy) { return { id: 'deepseek-v4-flash', score: 50, detail: 'default (internal not available)' }; },
    record: function() {},
    getStats: function(pt) { return []; },
    detectProblemType: function(text) { return 'custom'; },
    checkLocalModel: function() { return false; },
    isLocalModelAvailable: function() { return false; },
    callLocalModel: async function() { throw new Error('local model not available'); },
    setLocalModelAvailable: function() {},
    probeLocalModel: async function() { return false; },
  };
}

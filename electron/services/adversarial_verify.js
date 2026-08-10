/**
 * Polaris Adversarial Verification — proxy
 * Internal: internal/services/adversarial_verify.js (BARRIER 6)
 * Public:   passthrough stub (always passes)
 */
var path = require('path'); var fs = require('fs');
var internalPath = path.join(__dirname, '..', '..', 'internal', 'services', 'adversarial_verify.js');
if (fs.existsSync(internalPath)) { module.exports = require(internalPath); } else {
  module.exports = {
    perturbParams: function(d) { return []; },
    generateMismatch: function(d) { return []; },
    generateVariations: function(d) { return []; },
    scoreReasoningConsistency: function(r) { return { consistent: true, confidence: 100, detail: 'stub' }; },
    runAdversarialChecks: async function(d, outputs, cmd) { return { perturbations:[], mismatches:[], phrasing:{consistent:true,confidence:100}, passed:true, details:['Adversarial checks skipped — internal module not available'] }; },
  };
}

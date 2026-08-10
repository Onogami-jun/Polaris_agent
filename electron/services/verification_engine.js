/**
 * Polaris Verification Engine — proxy
 * Internal: internal/services/verification_engine.js (proprietary)
 *           or internal/services/verification_engine.js.enc (encrypted)
 * Public:   always-passes stub
 *
 * In dev, the encrypted .js.enc is decrypted by protect_verify.js
 * to produce internal/services/verification_engine.js at build time.
 * This proxy loads it if available; otherwise returns a lenient stub.
 */
var path = require('path'); var fs = require('fs');
var internalPath = path.join(__dirname, '..', '..', 'internal', 'services', 'verification_engine.js');
if (fs.existsSync(internalPath)) { module.exports = require(internalPath); } else {
  module.exports = {
    verifyAndScore: async function(userMessage, llmOutput, execLog, messages, apiKey) {
      return { passed: true, finalScore: 50, verdict: 'STUB', reason: 'Verification engine not available in public build', hardVetoes: [], softScores: [], hallucinations: 0, dualityGap: null };
    },
  };
}

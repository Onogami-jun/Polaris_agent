/**
 * Polaris Secrets Vault — proxy
 * Internal: internal/services/secrets.js (AES-256-GCM encrypted vault)
 * Public:   empty vault (no keys stored)
 */
var path = require('path'); var fs = require('fs');
var internalPath = path.join(__dirname, '..', '..', 'internal', 'services', 'secrets.js');
if (fs.existsSync(internalPath)) { module.exports = require(internalPath); } else {
  module.exports = {
    get: function(key) { return undefined; },
    set: function(key, value) {},
    remove: function(key) {},
    list: function() { return []; },
  };
}

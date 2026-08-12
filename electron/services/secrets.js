/**
 * Polaris Secrets Vault
 * Dev mode: loads from internal/services/secrets.js
 * Build mode: decrypts from inline encrypted payloads
 */
var path = require('path'); var fs = require('fs');
var internalPath = path.join(__dirname, '..', '..', 'internal', 'services', 'secrets.js');
if (fs.existsSync(internalPath)) { module.exports = require(internalPath); } else {
  // ═══════════════════════════════════════════════════════
  // Compiled build fallback: inline encrypted vault
  // ═══════════════════════════════════════════════════════
  var crypto = require('crypto');
  var VAULT_SEED = 'polaris_solver_bq7x_2026_agent_vault_k9';
  var VAULT = {
    deepseek_api_key: {
      iv:   'fa4e5cbd781fb312cd268902',
      data: '41b293f6f1d0a8df45b4e3c2b14dca455e0838f94af8a10ad5703cf04b9b662c74a4a5',
      tag:  'd101ce30ba9e7438dc032ec3bc48501c',
    },
    supabase_service_role: {
      iv:   '8797ad8b19e7f9b2802af892',
      data: '3f68051aa8ea7575f72d543ec54bf14a26815196f0d2c20fae624170673d737658ce56aae4d22fb162',
      tag:  'b3fe5b7d2193bc61eb86ef1f03b77787',
    },
    smtp_password: {
      iv:   'c96e407b330b539be3785782',
      data: '9b2be79ccf99e32c1acd7e0aec9bae94',
      tag:  'd561033d6141aa10bdb4cba3d7f90eeb',
    },
    github_client_secret: {
      iv:   '7039080ca78a42226d08f970',
      data: '115c5eeb6b5aee913d1089da9bc47bf5b06ef8aebb3ed999f17eadd37a1570644e4e17429d590584',
      tag:  '8581fdd5f9d920ea1daa572dcce819cb',
    },
  };

  function deriveKey() {
    return crypto.createHash('sha256').update(VAULT_SEED).digest();
  }

  function decrypt(entry) {
    var key = deriveKey();
    var decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(entry.tag, 'hex'));
    var decrypted = decipher.update(entry.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  var _cache = {};
  function getAll() {
    for (var name of Object.keys(VAULT)) {
      try { if (!_cache[name]) _cache[name] = decrypt(VAULT[name]); }
      catch(e) { console.error('[Vault] Failed to decrypt ' + name + ':', e.message); _cache[name] = ''; }
    }
    return _cache;
  }

  module.exports = {
    get: function(name) { return getAll()[name] || ''; },
    set: function(key, value) {},
    remove: function(key) {},
    list: function() { return Object.keys(VAULT); },
  };
}

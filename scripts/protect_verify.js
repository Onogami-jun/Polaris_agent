/**
 * Polaris Verification Engine Protect — launcher
 * Delegates to: internal/scripts/protect_verify.js
 */
var path = require('path'); var fs = require('fs');
var internalPath = path.join(__dirname, '..', 'internal', 'scripts', 'protect_verify.js');
if (fs.existsSync(internalPath)) {
  require(internalPath);
} else {
  console.log('[Polaris] protect_verify is not available in public builds.');
  console.log('  This script requires the internal development module.');
  process.exit(0);
}

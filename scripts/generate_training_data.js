/**
 * Polaris Training Data Generator — launcher
 * Delegates to: internal/scripts/generate_training_data.js
 * In public builds, this file serves as documentation only.
 */
var path = require('path'); var fs = require('fs');
var internalPath = path.join(__dirname, '..', 'internal', 'scripts', 'generate_training_data.js');
if (fs.existsSync(internalPath)) {
  // Run the real generator
  var mod = require(internalPath);
} else {
  console.log('[Polaris] Training data generator is not available in public builds.');
  console.log('  This script requires the internal development module.');
  console.log('  See internal/scripts/generate_training_data.js in the private repo.');
  process.exit(0);
}

/**
 * Key Manager — single source of truth for API key.
 * Loaded first before any other service module.
 */
let _apiKey = null;

function setKey(k) { _apiKey = k; }
function getKey() { return _apiKey || process.env.POLARIS_KEY; }

module.exports = { setKey, getKey };

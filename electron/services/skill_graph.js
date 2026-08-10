/**
 * Polaris Skill Graph — proxy
 * Internal: internal/services/skill_graph.js (BARRIER 5)
 * Public:   no-op stub
 */
var path = require('path'); var fs = require('fs');
var internalPath = path.join(__dirname, '..', '..', 'internal', 'services', 'skill_graph.js');
if (fs.existsSync(internalPath)) { module.exports = require(internalPath); } else {
  function emptyArr() { return []; }
  function emptyStr() { return ''; }
  module.exports = {
    recordPath: function() {}, querySimilar: emptyArr, getEdgeStats: emptyArr,
    buildPlanningContext: emptyStr,
  };
}

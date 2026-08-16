/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris Auto-Composition Skill Graph v1.0
 *  ─────────────────────────────────────────────────────────
 *  ★ BARRIER 5: 自动技能编排图
 *
 *  记录每次成功的工作流 → 构建技能图 → LLM 检索自动组合。
 *
 *  图结构:
 *    节点 = 技能
 *    边 = "Skill A 的输出被用作 Skill B 的输入"
 *    边权重 = 该组合被使用的次数
 *
 *  LLM 规划时，从图中检索最相似的子图作为参考。
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const GRAPH_FILE = path.join(os.homedir(), '.polaris', 'skill_graph.json');

/* ── Node: one skill invocation ── */
function makeNode(skillId, params, result) {
  return {
    skill: skillId,
    params: summarizeParams(params),
    result: summarizeResult(result),
    ts: Date.now(),
  };
}

function summarizeParams(p) {
  if (!p) return {};
  var s = {};
  var keys = Object.keys(p).slice(0, 8);
  for (var i = 0; i < keys.length; i++) {
    var v = p[keys[i]];
    if (typeof v === 'string') s[keys[i]] = v.slice(0, 100);
    else if (typeof v === 'number') s[keys[i]] = v;
    else if (Array.isArray(v)) s[keys[i]] = 'array[' + v.length + ']';
    else s[keys[i]] = '[object]';
  }
  return s;
}

function summarizeResult(r) {
  if (!r) return {};
  if (r.success !== undefined) return { success: r.success, error: (r.error || '').slice(0, 100) };
  return { ok: true };
}

/* ── Edge: skill A feeds into skill B ── */
function makeEdge(fromSkill, toSkill, dataKeys) {
  return { from: fromSkill, to: toSkill, keys: dataKeys, count: 1 };
}

/* ── Path: a completed user workflow ── */
function makePath(goalText, nodes, edges, meta) {
  return {
    id: 'path_' + Date.now(),
    goal: (goalText || '').slice(0, 300),
    nodes: nodes,
    edges: edges,
    meta: Object.assign({ ts: Date.now() }, meta || {}),
  };
}

/* ── Load / Save ── */
function loadGraph() {
  try {
    if (fs.existsSync(GRAPH_FILE)) return JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));
  } catch {}
  return { paths: [], edges: {}, nodes_seen: {}, totalPaths: 0 };
}

function saveGraph(g) {
  try {
    var dir = path.dirname(GRAPH_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    g.totalPaths = g.paths.length;
    fs.writeFileSync(GRAPH_FILE, JSON.stringify(g, null, 2));
  } catch {}
}

/* ── Record a completed path ── */
function recordPath(goalText, stepResults, meta) {
  var g = loadGraph();
  var nodes = [];
  var edges = [];

  for (var i = 0; i < stepResults.length; i++) {
    var sr = stepResults[i];
    nodes.push(makeNode(sr.skill, sr.params, sr.outputs || sr));

    // Record edges between consecutive skills
    if (i > 0) {
      var fromId = stepResults[i - 1].skill;
      var toId = sr.skill;
      var edgeKey = fromId + '→' + toId;
      if (!g.edges[edgeKey]) g.edges[edgeKey] = { from: fromId, to: toId, count: 1 };
      else g.edges[edgeKey].count += 1;
      edges.push({ from: fromId, to: toId, count: g.edges[edgeKey].count });
    }

    // Count node usage
    g.nodes_seen[sr.skill] = (g.nodes_seen[sr.skill] || 0) + 1;
  }

  g.paths.push(makePath(goalText, nodes, edges, meta));
  // Keep last 200 paths
  if (g.paths.length > 200) g.paths = g.paths.slice(-200);

  saveGraph(g);
  return g;
}

/* ── Query: find paths similar to a goal ── */
function querySimilar(goalText, limit) {
  var g = loadGraph();
  var l = limit || 5;
  if (g.paths.length === 0) return [];

  // Simple TF-IDF-like similarity on goal text
  var queryWords = (goalText || '').toLowerCase().split(/\s+/).filter(Boolean);
  var scored = g.paths.map(function(p) {
    var goalWords = (p.goal || '').toLowerCase().split(/\s+/).filter(Boolean);
    var matches = 0;
    for (var qi = 0; qi < queryWords.length; qi++) {
      if (goalWords.indexOf(queryWords[qi]) >= 0) matches++;
    }
    return { path: p, score: queryWords.length > 0 ? matches / queryWords.length : 0 };
  });

  scored.sort(function(a, b) { return b.score - a.score; });
  return scored.slice(0, l).filter(function(s) { return s.score > 0; }).map(function(s) {
    return {
      goal: s.path.goal.slice(0, 200),
      skillChain: s.path.nodes.map(function(n) { return { skill: n.skill, params: n.params }; }),
      edges: s.path.edges.slice(0, 10),
      similarity: Math.round(s.score * 100) + '%',
    };
  });
}

/* ── Get edge stats: most frequent transitions ── */
function getEdgeStats(limit) {
  var g = loadGraph();
  var pairs = Object.values(g.edges);
  pairs.sort(function(a, b) { return b.count - a.count; });
  return pairs.slice(0, limit || 10).map(function(e) {
    return { from: e.from, to: e.to, count: e.count };
  });
}

/* ── Build context for LLM planning ── */
function buildPlanningContext(goalText) {
  var similar = querySimilar(goalText, 3);
  var edges = getEdgeStats(10);

  var lines = [];
  if (similar.length > 0) {
    lines.push('## Similar Workflows');
    for (var si = 0; si < similar.length; si++) {
      var s = similar[si];
      lines.push('- ' + s.goal + ' → [' + s.skillChain.map(function(n) { return n.skill; }).join(' → ') + '] (similarity: ' + s.similarity + ')');
    }
  }
  if (edges.length > 0) {
    lines.push('## Frequent Transitions');
    for (var ei = 0; ei < edges.length; ei++) {
      lines.push('- ' + edges[ei].from + ' → ' + edges[ei].to + ' (×' + edges[ei].count + ')');
    }
  }
  return lines.join('\n');
}

module.exports = { recordPath, querySimilar, getEdgeStats, buildPlanningContext };

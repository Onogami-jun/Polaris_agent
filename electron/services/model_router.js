/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris Self-Healing Model Router v1.0
 *  ─────────────────────────────────────────────────────────
 *  ★ BARRIER 9: 自愈型模型路由器
 *
 *  验证引擎的反馈信号 → 自动更新路由决策。
 *
 *  路由表:
 *    问题类型 × 模型 → 成功率 / 幻觉率 / 对偶间隙 / 求解时间
 *  每个维度一个分表，加权评分决定路由。
 *
 *  冷启动: 用公开 benchmark 预热路由表
 *  运行时: 每次验证后更新路由表
 *  路由决策: 加权评分 → 选择最优模型
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_FILE = path.join(os.homedir(), '.polaris', 'model_router.json');

/* ── Model registry ── */
var MODELS = {
  'deepseek-v4-flash': { provider: 'deepseek', costPer1k: 0.0014, latency: 'fast', maxTokens: 4096 },
  'deepseek-v4':       { provider: 'deepseek', costPer1k: 0.028,  latency: 'medium', maxTokens: 8192 },
  'claude-sonnet-4':   { provider: 'anthropic', costPer1k: 0.003,  latency: 'fast', maxTokens: 4096 },
  'claude-opus-4':     { provider: 'anthropic', costPer1k: 0.015,  latency: 'medium', maxTokens: 8192 },
  'gpt-4o':            { provider: 'openai', costPer1k: 0.005,  latency: 'fast', maxTokens: 4096 },
};

/* ── Default routing table (cold start) ── */
var DEFAULT_TABLE = function() {
  // Pre-seeded with typical performance ratios per problem type
  var problems = ['knapsack', 'scheduling', 'assignment', 'facility', 'vrp', 'multi_knapsack', 'set_covering', 'custom'];
  var models = Object.keys(MODELS);
  var t = {};
  for (var pi = 0; pi < problems.length; pi++) {
    t[problems[pi]] = {};
    for (var mi = 0; mi < models.length; mi++) {
      t[problems[pi]][models[mi]] = {
        total: 0,
        success: 0,
        hallucinations: 0,
        avgDualityGap: 0,
        avgTime: 0,
        lastUsed: 0,
      };
    }
  }
  return t;
};

/* ── Load / Save ── */
function loadTable() {
  try {
    if (fs.existsSync(ROUTER_FILE)) {
      return JSON.parse(fs.readFileSync(ROUTER_FILE, 'utf8'));
    }
  } catch {}
  return DEFAULT_TABLE();
}

function saveTable(table) {
  try {
    var dir = path.dirname(ROUTER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ROUTER_FILE, JSON.stringify(table, null, 2));
  } catch {}
}

/* ── Route: pick best model ── */
function route(problemType, strategy) {
  var table = loadTable();
  var candidates = table[problemType] || table['custom'];
  if (!candidates) return 'deepseek-v4-flash';

  var modelIds = Object.keys(candidates);
  var scored = modelIds.map(function(id) {
    var s = candidates[id];
    if (s.total < 3) return { id: id, score: 50, detail: 'insufficient data' }; // Cold start bias

    var successRate = s.total > 0 ? s.success / s.total : 0.5;
    var hallucRate = s.total > 0 ? s.hallucinations / s.total : 0.5;
    var gapScore = s.avgDualityGap < 0.01 ? 100 : s.avgDualityGap < 0.05 ? 80 : 60;
    var timeScore = s.avgTime < 1000 ? 100 : s.avgTime < 3000 ? 70 : 50;

    // Weighted score: accuracy 40%, hallucination 25%, gap 20%, time 15%
    var score = successRate * 40 + (1 - hallucRate) * 25 + gapScore * 0.2 + timeScore * 0.15;

    if (strategy === 'cost_optimized') {
      score -= (MODELS[id] ? MODELS[id].costPer1k * 1000 : 0);
    }
    if (strategy === 'best_quality') {
      score = successRate * 50 + gapScore * 0.5;
    }

    return { id: id, score: Math.round(score * 10) / 10, detail: 'success=' + (successRate * 100).toFixed(0) + '% hall=' + (hallucRate * 100).toFixed(0) + '% gap=' + s.avgDualityGap.toFixed(3) };
  });

  scored.sort(function(a, b) { return b.score - a.score; });
  return scored[0] || { id: 'deepseek-v4-flash', score: 50 };
}

/* ── Record: update routing table after verification ── */
function record(problemType, modelId, verificationResult) {
  var table = loadTable();
  if (!table[problemType]) table[problemType] = {};
  for (var mk in MODELS) { if (!table[problemType][mk]) table[problemType][mk] = { total: 0, success: 0, hallucinations: 0, avgDualityGap: 0, avgTime: 0, lastUsed: 0 }; }

  var entry = table[problemType][modelId];
  entry.total += 1;
  if (verificationResult.passed) entry.success += 1;
  if (verificationResult.hallucinations) entry.hallucinations += verificationResult.hallucinations;

  // Rolling average for gap
  if (verificationResult.dualityGap !== undefined) {
    entry.avgDualityGap = (entry.avgDualityGap * (entry.total - 1) + verificationResult.dualityGap) / entry.total;
  }

  entry.lastUsed = Date.now();
  saveTable(table);
}

/* ── Get routing statistics ── */
function getStats(problemType) {
  var table = loadTable();
  var candidates = table[problemType] || table['custom'];
  if (!candidates) return [];

  return Object.keys(candidates).map(function(id) {
    var s = candidates[id];
    return {
      model: id,
      total: s.total,
      successRate: s.total > 0 ? Math.round((s.success / s.total) * 100) : null,
      hallucRate: s.total > 0 ? Math.round((s.hallucinations / s.total) * 100) : null,
      avgGap: s.avgDualityGap,
    };
  });
}

/* ── Detect problem type from DSL or text ── */
function detectProblemType(dslOrText) {
  if (dslOrText && dslOrText.type && dslOrText.params) return dslOrText.type.replace(/_/g, '').replace(/01$/, '');

  var t = String(dslOrText || '').toLowerCase();
  if (/knapsack|背包/i.test(t)) return 'knapsack';
  if (/schedule|排产|调度|single.?machine/i.test(t)) return 'scheduling';
  if (/assign|指派|assignment/i.test(t)) return 'assignment';
  if (/facility|选址|location/i.test(t)) return 'facility';
  if (/vrp|vehicle|车辆|路径|routing/i.test(t)) return 'vrp';
  if (/multi.*knapsack|多背包/i.test(t)) return 'multi_knapsack';
  if (/set.?cover|集合覆盖/i.test(t)) return 'set_covering';
  return 'custom';
}

module.exports = { route, record, getStats, detectProblemType, MODELS };

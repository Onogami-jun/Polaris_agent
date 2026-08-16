/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris Self-Healing Model Router v2.0
 *  ─────────────────────────────────────────────────────────
 *  ★ BARRIER 9: 自愈型模型路由器
 *
 *  核心原则（v2 重构）:
 *    1. 只返回「真正可用」的模型 — 没有 API key 的模型绝不路由
 *    2. 本地模型仅用于「明确的优化问题 + cost_optimized 策略」
 *    3. 聊天/讨论/需要 tool calls 的场景一律走 DeepSeek
 *    4. 本地模型探测是同步可靠的（启动时探测 + 30s 缓存）
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');

const ROUTER_FILE = path.join(os.homedir(), '.polaris', 'model_router.json');

/* ── Model registry ──
 * 只有 provider 为 deepseek 和 local 的模型真正可用。
 * anthropic/openai 模型当前无 API key，仅登记占位，不参与路由。 */
var MODELS = {
  'deepseek-v4-flash':  { provider: 'deepseek', costPer1k: 0.0014, latency: 'fast',   maxTokens: 4096, local: false, available: true },
  'deepseek-v4':        { provider: 'deepseek', costPer1k: 0.028,  latency: 'medium', maxTokens: 8192, local: false, available: true },
  'claude-sonnet-4':    { provider: 'anthropic', costPer1k: 0.003, latency: 'fast',   maxTokens: 4096, local: false, available: false },
  'claude-opus-4':      { provider: 'anthropic', costPer1k: 0.015, latency: 'medium', maxTokens: 8192, local: false, available: false },
  'gpt-4o':             { provider: 'openai',    costPer1k: 0.005, latency: 'fast',   maxTokens: 4096, local: false, available: false },
  'polaris-opt-local':  { provider: 'local',     costPer1k: 0,      latency: 'fast',   maxTokens: 1024, local: true,  available: false },
};

/* ── Default routing table (cold start) ── */
function DEFAULT_TABLE() {
  var problems = ['knapsack', 'scheduling', 'assignment', 'facility', 'vrp', 'multi_knapsack', 'set_covering', 'custom'];
  var models = Object.keys(MODELS);
  var t = {};
  for (var pi = 0; pi < problems.length; pi++) {
    t[problems[pi]] = {};
    for (var mi = 0; mi < models.length; mi++) {
      t[problems[pi]][models[mi]] = { total: 0, success: 0, hallucinations: 0, avgDualityGap: 0, avgTime: 0, lastUsed: 0 };
    }
  }
  return t;
}

/* ── Load / Save ── */
function loadTable() {
  try {
    if (fs.existsSync(ROUTER_FILE)) return JSON.parse(fs.readFileSync(ROUTER_FILE, 'utf8'));
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

/* ── Local model detection — set by main.js, cached here ── */
var _localAvailable = false;
var _localCheckTime = 0;

/* main.js calls this when the serve process starts/stops */
function setLocalModelAvailable(available) {
  _localAvailable = !!available;
  _localCheckTime = Date.now();
  MODELS['polaris-opt-local'].available = _localAvailable;
}

/* Probe via HTTP (async, used for manual/periodic checks) */
function probeLocalModel() {
  return new Promise(function(resolve) {
    var req = http.get('http://127.0.0.1:8080/health', function(res) {
      var d = '';
      res.on('data', function(c) { d += c.toString(); });
      res.on('end', function() {
        var ok = res.statusCode === 200 && (d.includes('ok') || d.includes('status'));
        setLocalModelAvailable(ok);
        resolve(ok);
      });
    });
    req.on('error', function() { setLocalModelAvailable(false); resolve(false); });
    req.setTimeout(2000, function() { req.destroy(); setLocalModelAvailable(false); resolve(false); });
  });
}

function checkLocalModel() {
  // Fire-and-forget probe to keep cache fresh; return last known state immediately
  var now = Date.now();
  if (now - _localCheckTime > 30000) probeLocalModel();
  return _localAvailable;
}

function isLocalModelAvailable() {
  return checkLocalModel();
}

/* ── Route: pick best AVAILABLE model ──
 * localOk is decided by the LLM (classifyForRouting), not hardcoded here. */
function route(problemType, strategy, localOk) {
  var localAvailable = checkLocalModel();

  // Local model only when: LLM says suitable + cost_optimized + local running
  if (localOk === true && localAvailable && strategy === 'cost_optimized') {
    return { id: 'polaris-opt-local', score: 85, detail: 'LLM-routed: local model suitable, 0 cost' };
  }

  var table = loadTable();
  var candidates = table[problemType] || table['custom'];
  if (!candidates) return { id: 'deepseek-v4-flash', score: 50, detail: 'default' };

  // Only consider AVAILABLE models (deepseek has key, local may be available)
  var availableIds = Object.keys(MODELS).filter(function(id) {
    var m = MODELS[id];
    if (m.local) return m.available;          // local only if running
    return m.available;                        // deepseek always available
  });

  var scored = availableIds.map(function(id) {
    var s = candidates[id] || { total: 0, success: 0, hallucinations: 0, avgDualityGap: 0, avgTime: 0 };
    if (s.total < 3) return { id: id, score: id === 'deepseek-v4-flash' ? 50 : 45, detail: 'insufficient data' };

    var successRate = s.total > 0 ? s.success / s.total : 0.5;
    var hallucRate = s.total > 0 ? s.hallucinations / s.total : 0.5;
    var gapScore = s.avgDualityGap < 0.01 ? 100 : s.avgDualityGap < 0.05 ? 80 : 60;
    var timeScore = s.avgTime < 1000 ? 100 : s.avgTime < 3000 ? 70 : 50;

    var score = successRate * 40 + (1 - hallucRate) * 25 + gapScore * 0.2 + timeScore * 0.15;

    if (strategy === 'cost_optimized') score -= (MODELS[id] ? MODELS[id].costPer1k * 1000 : 0);
    if (strategy === 'best_quality') score = successRate * 50 + gapScore * 0.5;

    return { id: id, score: Math.round(score * 10) / 10, detail: 'success=' + (successRate * 100).toFixed(0) + '% hall=' + (hallucRate * 100).toFixed(0) + '%' };
  });

  scored.sort(function(a, b) { return b.score - a.score; });
  return scored[0] || { id: 'deepseek-v4-flash', score: 50, detail: 'default' };
}

/* ── Record: update routing table after verification ── */
function record(problemType, modelId, verificationResult) {
  var table = loadTable();
  if (!table[problemType]) table[problemType] = {};
  for (var mk in MODELS) { if (!table[problemType][mk]) table[problemType][mk] = { total: 0, success: 0, hallucinations: 0, avgDualityGap: 0, avgTime: 0, lastUsed: 0 }; }

  var entry = table[problemType][modelId];
  if (!entry) return; // unknown model
  entry.total += 1;
  if (verificationResult.passed) entry.success += 1;
  if (verificationResult.hallucinations) entry.hallucinations += verificationResult.hallucinations;
  if (verificationResult.dualityGap !== undefined && verificationResult.dualityGap !== null) {
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

/* ── Call local model ── */
function callLocalModel(prompt, options) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({
      prompt: prompt,
      n_predict: (options && options.maxTokens) || 512,
      temperature: (options && options.temperature) || 0.1,
      stop: ['</s>', '<|im_end|>', '###'],
      stream: false,
    });
    var req = http.request({
      hostname: '127.0.0.1', port: 8080, path: '/completion', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, function(res) {
      var d = '';
      res.on('data', function(c) { d += c.toString(); });
      res.on('end', function() {
        try {
          var json = JSON.parse(d);
          resolve({ content: json.content || json.text || '' });
        } catch { resolve({ content: d.slice(0, 2000) }); }
      });
    });
    req.on('error', function(e) { reject(e); });
    req.on('timeout', function() { req.destroy(); reject(new Error('Local model timeout')); });
    req.write(body); req.end();
  });
}

module.exports = { route, record, getStats, detectProblemType, MODELS, checkLocalModel, isLocalModelAvailable, callLocalModel, setLocalModelAvailable, probeLocalModel };

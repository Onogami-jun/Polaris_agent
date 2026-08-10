/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris Data Flywheel v1.0
 *  ─────────────────────────────────────────────────────────
 *  ★ BARRIER 1: 自动标注数据飞轮
 *
 *  每次求解 → 自动产生一条带标签的训练样本:
 *    { question, dsl_params, llm_output, verification_tags, duality_gap, provenance }
 *
 *  格式: JSONL (方便 DPO/RLHF 训练直接读取)
 *  输出目录: ~/.polaris/training_data/
 *
 *  产生的数据集:
 *    - dpo_preference_pairs.jsonl   (好/坏回答对，用于 DPO)
 *    - verification_labels.jsonl    (验证标签数据集)
 *    - routing_performance.jsonl    (路由性能记录)
 *    - hallucination_samples.jsonl  (幻觉检测正负样本)
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.polaris', 'training_data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function appendJSONL(filename, obj) {
  ensureDir();
  try {
    fs.appendFileSync(path.join(DATA_DIR, filename), JSON.stringify(obj) + '\n');
  } catch {}
}

/* ── Record: DPO preference pair ── */
function recordDPOPair(userMessage, goodResponse, badResponse, scores) {
  appendJSONL('dpo_preference_pairs.jsonl', {
    ts: new Date().toISOString(),
    question: userMessage.slice(0, 2000),
    chosen: goodResponse.slice(0, 4000),
    rejected: badResponse.slice(0, 4000),
    chosen_score: scores.good,
    rejected_score: scores.bad,
    reason: scores.good > scores.bad ? 'preferred' : 'rejected',
    meta: { model: scores.model, type: scores.type },
  });
}

/* ── Record: verification result ── */
function recordVerification(userMessage, llmOutput, verificationResult, model) {
  appendJSONL('verification_labels.jsonl', {
    ts: new Date().toISOString(),
    question: userMessage.slice(0, 2000),
    llm_output: llmOutput.slice(0, 4000),
    passed: verificationResult.passed,
    score: verificationResult.finalScore || 0,
    hard_vetoes: (verificationResult.hardVetoes || []).map(function(v) { return { name: v.name, passed: v.passed, detail: v.detail }; }),
    soft_scores: (verificationResult.softScores || []).map(function(s) { return { dim: s.dimension, score: s.score }; }),
    duality_gap: verificationResult.dualityGap || null,
    hallucinations: verificationResult.hallucinations || 0,
    model: model,
    type: verificationResult.verdict || 'unknown',
  });
}

/* ── Record: routing decision + outcome ── */
function recordRouting(problemType, modelSelected, verificationResult) {
  appendJSONL('routing_performance.jsonl', {
    ts: new Date().toISOString(),
    problem_type: problemType,
    model: modelSelected,
    passed: verificationResult.passed,
    score: verificationResult.finalScore || 0,
    duality_gap: verificationResult.dualityGap || null,
  });
}

/* ── Record: hallucination sample ── */
function recordHallucination(userMessage, llmOutput, untrustedClaims, trustedClaims) {
  if (!untrustedClaims || untrustedClaims.length === 0) return;
  appendJSONL('hallucination_samples.jsonl', {
    ts: new Date().toISOString(),
    question: userMessage.slice(0, 1000),
    llm_output: llmOutput.slice(0, 3000),
    untrusted_values: untrustedClaims.map(function(c) { return { value: c.value, context: c.context }; }),
    trusted_values: (trustedClaims || []).map(function(c) { return { value: c.value, source: c.source }; }),
    untrusted_count: untrustedClaims.length,
    trusted_count: (trustedClaims || []).length,
  });
}

/* ── Stats: how much data we have ── */
function getDatasetStats() {
  var stats = {};
  var files = ['dpo_preference_pairs.jsonl', 'verification_labels.jsonl', 'routing_performance.jsonl', 'hallucination_samples.jsonl'];
  for (var i = 0; i < files.length; i++) {
    try {
      var f = path.join(DATA_DIR, files[i]);
      if (!fs.existsSync(f)) { stats[files[i]] = 0; continue; }
      stats[files[i]] = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length;
    } catch { stats[files[i]] = 0; }
  }
  return stats;
}

/* ── Export dataset for training ── */
function exportDataset(format) {
  ensureDir();
  var exportPath = path.join(DATA_DIR, 'export_' + format);
  var files = ['dpo_preference_pairs.jsonl', 'verification_labels.jsonl', 'routing_performance.jsonl', 'hallucination_samples.jsonl'];

  if (format === 'jsonl') {
    // Just copy — already JSONL
    return { success: true, dir: DATA_DIR, files: files.map(function(f) { return path.join(DATA_DIR, f); }) };
  }

  return { success: false, error: 'Unsupported export format: ' + format + '. Use jsonl.' };
}

module.exports = { recordDPOPair, recordVerification, recordRouting, recordHallucination, getDatasetStats, exportDataset };

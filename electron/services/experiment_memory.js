/**
 * Polaris Experiment Memory v1.0
 * Stores experiment metadata so Agent can reference past runs.
 * "再跑一次上次的实验，换5个seed" — Agent knows what "上次" means.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const MEMORY_DIR = path.join(os.homedir(), '.polaris', 'experiments');
const MEMORY_FILE = path.join(MEMORY_DIR, 'history.json');
const MAX_HISTORY = 50;

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function loadHistory() {
  ensureDir();
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    }
  } catch (e) { /* corrupted, start fresh */ }
  return [];
}

function saveHistory(history) {
  ensureDir();
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(history.slice(-MAX_HISTORY), null, 2));
  } catch (e) { console.error('Failed to save experiment history:', e.message); }
}

/**
 * Record one experiment.
 * @param {object} meta - { problem, sizes, solvers, seed, results }
 */
function recordExperiment(meta) {
  const history = loadHistory();
  const entry = {
    id: 'exp_' + Date.now(),
    timestamp: new Date().toISOString(),
    ...meta,
  };
  history.unshift(entry);
  saveHistory(history);
  return entry;
}

/**
 * Find the most recent experiment matching criteria.
 * @param {string} problem - optional problem filter
 * @returns {object|null}
 */
function lastExperiment(problem) {
  const history = loadHistory();
  if (problem) {
    return history.find(e => e.problem === problem) || null;
  }
  return history[0] || null;
}

/**
 * List all experiments, with optional filtering.
 */
function listExperiments(problem, limit = 10) {
  let history = loadHistory();
  if (problem) history = history.filter(e => e.problem === problem);
  return history.slice(0, limit).map(e => ({
    id: e.id,
    timestamp: e.timestamp,
    problem: e.problem,
    sizes: e.sizes,
    solvers: e.solvers,
    seed: e.seed,
    summary: e.summary || `${e.problem} n=${e.sizes} ${e.solvers}`,
  }));
}

/**
 * Build a context string for the LLM describing past experiments.
 */
function buildExperimentContext(maxExperiments = 3) {
  const history = loadHistory();
  if (history.length === 0) return '';

  const recent = history.slice(0, maxExperiments);
  const lines = ['## 最近实验记录'];
  for (const e of recent) {
    lines.push(`- [${e.timestamp.slice(0, 16)}] ${e.problem}, sizes=${e.sizes}, solvers=${e.solvers}, seed=${e.seed}`);
    if (e.summary) lines.push(`  结果摘要: ${e.summary}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Save experiment output files (markdown tables, latex, etc.)
 */
function saveExperimentOutput(filename, content) {
  ensureDir();
  const filepath = path.join(MEMORY_DIR, filename);
  fs.writeFileSync(filepath, content);
  return filepath;
}

module.exports = {
  recordExperiment,
  lastExperiment,
  listExperiments,
  buildExperimentContext,
  saveExperimentOutput,
};

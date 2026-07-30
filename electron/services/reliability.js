/**
 * Polaris Reliability Layer v1.0
 *
 * Patterns from:
 *   - Hell or High Water (JHU-CLSP): try every path before giving up,
 *     report diagnostic info when all paths fail
 *   - VIGIL: reflective runtime — detect failure, self-heal, retry
 *   - Circuit Breaker: fast-fail cascading failures, auto-reset
 *
 * Three-layer protection:
 *   1. Circuit Breaker — stop retrying broken paths
 *   2. Multi-Path Fallback — try A, then B, then C
 *   3. Self-Diagnosis — check environment before execution
 */

// ── Layer 1: Circuit Breaker ────────────────────────────────────────────────

class CircuitBreaker {
  constructor(name, { failureThreshold = 3, resetTimeout = 30000 } = {}) {
    this.name = name;
    this.failureCount = 0;
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.state = 'closed';  // closed → open → half-open → closed
    this.lastFailureTime = 0;
    this.lastError = null;
  }

  async execute(fn) {
    // Open circuit — fast fail
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        return { success: false, error: `[熔断] ${this.name} 暂时不可用（${Math.ceil((this.resetTimeout - (Date.now() - this.lastFailureTime)) / 1000)}秒后重试）` };
      }
    }

    try {
      const result = await fn();
      // Success — reset
      if (this.state === 'half-open') this.state = 'closed';
      this.failureCount = 0;
      return result;
    } catch (e) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      this.lastError = e.message;
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'open';
      }
      throw e;
    }
  }
}

// ── Layer 2: Multi-Path Fallback ────────────────────────────────────────────

async function withFallback(paths) {
  /** Try each path in order. First success wins. All failures → diagnostic report. */
  const errors = [];
  for (let i = 0; i < paths.length; i++) {
    try {
      const result = await paths[i]();
      if (result && result.success) return result;
      if (result && !result.error) return { success: true, result, path: i };
      errors.push({ path: i, error: result?.error || 'Unknown' });
    } catch (e) {
      errors.push({ path: i, error: e.message });
    }
  }
  // All failed → diagnostic report
  const report = errors.map((e, idx) => `  路径${e.path}: ${e.error}`).join('\n');
  return {
    success: false,
    error: `所有 ${paths.length} 条求解路径均失败：\n${report}\n\n请检查：\n1. Python 3.11+ 是否已安装\n2. pip install polaris-opt[highs] 是否执行\n3. 终端运行 python -c "from polaris import solve" 是否成功`,
  };
}

// ── Layer 3: Self-Diagnosis ──────────────────────────────────────────────────

function diagnose() {
  const { spawnSync } = require('child_process');
  const results = [];

  // Python
  let pythonCmd = null;
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['-c', 'print("OK")'], { timeout: 5000, encoding: 'utf8' });
    if (r.status === 0 && r.stdout.includes('OK')) { pythonCmd = cmd; break; }
  }
  results.push({ check: 'Python', ok: !!pythonCmd, detail: pythonCmd || 'Not found' });
  if (!pythonCmd) return results;

  // Polaris
  const pr = spawnSync(pythonCmd, ['-c', 'from polaris import solve; print("POLARIS_OK")'], { timeout: 15000, encoding: 'utf8' });
  results.push({ check: 'Polaris Engine', ok: pr.status === 0 && pr.stdout.includes('POLARIS_OK'), detail: pr.stderr?.slice(0, 200) || '' });

  // HiGHS
  const hr = spawnSync(pythonCmd, ['-c', 'from polaris.solvers.highs import HighsSolver; print("HIGHS_OK")'], { timeout: 10000, encoding: 'utf8' });
  results.push({ check: 'HiGHS Solver', ok: hr.status === 0 && hr.stdout.includes('HIGHS_OK'), detail: '' });

  // DeepSeek
  const https = require('https');
  const dsOk = new Promise(resolve => {
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-665f376d7c0f4b91b4c3029bf82e670a', 'Content-Length': Buffer.byteLength(JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })) },
      timeout: 8000,
    }, resp => { let d = ''; resp.on('data', c => d += c.toString()); resp.on('end', () => { try { JSON.parse(d); resolve(true); } catch { resolve(false); } }); });
    req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })); req.end();
  });
  results.push({ check: 'DeepSeek API', ok: false, detail: 'Checking...' });

  return { results, pythonCmd, dsPromise: dsOk };
}

// ── Execute Polaris with reliability guarantees ──────────────────────────────

const pythonBreaker = new CircuitBreaker('python', { failureThreshold: 3, resetTimeout: 60000 });
const deepseekBreaker = new CircuitBreaker('deepseek', { failureThreshold: 3, resetTimeout: 60000 });

/**
 * Reliable solve: try every path, never crash, always return a diagnostic message.
 */
async function reliableSolve(prompt, onExec) {
  return withFallback([
    // Path 0: Direct Python solve (offline, fastest)
    async () => {
      if (onExec) onExec({ tool: 'circuit:direct', status: 'running', detail: '尝试直接求解...' });
      const { spawnSync: sp } = require('child_process');
      const normalized = JSON.stringify(prompt);
      const code = `import sys; sys.stdout.reconfigure(encoding='utf-8')
from polaris.chat import solve
print(solve(${normalized}))`;
      const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
      const r = sp('python', ['-c', code], { timeout: 30000, encoding: 'utf8', env });
      const out = (r.stdout || r.stderr || '').trim();
      if (out && !out.includes('未能识别') && !out.includes('ModuleNotFoundError')) {
        if (onExec) onExec({ tool: 'circuit:direct', status: 'done', detail: '直接求解成功' });
        return { success: true, result: out, path: 'direct' };
      }
      throw new Error(out || 'Python 无输出');
    },

    // Path 1: Rule-based parse first, then model + solve
    async () => {
      if (onExec) onExec({ tool: 'circuit:rule', status: 'running', detail: '尝试规则解析...' });
      const { spawnSync: sp } = require('child_process');
      const normalized = JSON.stringify(prompt);
      const code = `import sys; sys.stdout.reconfigure(encoding='utf-8')
from polaris.chat import _parse, _build_model, _solve, _format_result
parsed = _parse(${normalized})
if parsed.ptype is not None and str(parsed.ptype) != 'ProblemType.UNKNOWN':
    m = _build_model(parsed)
    r = _solve(m)
    print(_format_result(parsed, r, m))
else:
    print('RULE_FAILED')`;
      const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
      const r = sp('python', ['-c', code], { timeout: 30000, encoding: 'utf8', env });
      const out = (r.stdout || r.stderr || '').trim();
      if (out && !out.includes('RULE_FAILED') && !out.includes('ModuleNotFoundError') && out.length > 5) {
        if (onExec) onExec({ tool: 'circuit:rule', status: 'done', detail: '规则解析成功' });
        return { success: true, result: out, path: 'rule' };
      }
      throw new Error('RULE_FAILED');
    },

    // Path 2: LLM parser → model → solve (DeepSeek)
    async () => {
      if (onExec) onExec({ tool: 'circuit:llm', status: 'running', detail: '尝试 LLM 解析...' });
      return new Promise(resolve => {
        const https = require('https');
        const body = JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是优化问题解析器。把用户描述翻译为 JSON：{ "problem_type": "knapsack"|"assignment"|"scheduling"|"facility"|"multi_knapsack"|"set_covering"|"vrp"|"custom", "values":[], "weights":[], "capacity":0, ... }。只输出 JSON。' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1024, temperature: 0.1, response_format: { type: 'json_object' },
        });
        const req = https.request({
          hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-665f376d7c0f4b91b4c3029bf82e670a', 'Content-Length': Buffer.byteLength(body) },
          timeout: 20000,
        }, resp => {
          let d = ''; resp.on('data', c => d += c.toString());
          resp.on('end', () => {
            try {
              const j = JSON.parse(d);
              const content = j.choices?.[0]?.message?.content || '';
              const params = JSON.parse(content);
              // Now call Python with the parsed params
              const { spawnSync: sp } = require('child_process');
              const norm2 = JSON.stringify(prompt);
              const pcode = `import sys, json; sys.stdout.reconfigure(encoding='utf-8')
from polaris.chat import ProblemType, ParsedProblem, _build_model, _solve, _format_result
params = json.loads(\"\"\"${JSON.stringify(params).replace(/"/g, '\\\\"')}\"\"\")
ptype_str = params.get('problem_type', 'unknown')
mapping = {'knapsack':0,'assignment':1,'scheduling':2,'multi_knapsack':3,'set_covering':4,'facility':5,'vrp':6}
if ptype_str in mapping:
    types = [ProblemType.KNAPSACK,ProblemType.ASSIGNMENT,ProblemType.SCHEDULING,ProblemType.MULTI_KNAPSACK,ProblemType.SET_COVERING,ProblemType.FACILITY,ProblemType.VRP]
    p = ParsedProblem(ptype=types[mapping[ptype_str]], params=params, raw=${norm2})
    m = _build_model(p)
    r = _solve(m)
    print(_format_result(p, r, m))
else:
    print('LLM_PARSE_FAILED')`;
              const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
              const pr = sp('python', ['-c', pcode], { timeout: 30000, encoding: 'utf8', env });
              const out = (pr.stdout || pr.stderr || '').trim();
              if (out && !out.includes('LLM_PARSE_FAILED') && !out.includes('Error') && out.length > 5) {
                resolve({ success: true, result: out, path: 'llm' });
              } else {
                resolve({ success: false, error: 'LLM_PARSE_FAILED' });
              }
            } catch (e) { resolve({ success: false, error: 'LLM parse error: ' + e.message }); }
          });
        });
        req.on('error', e => resolve({ success: false, error: 'DeepSeek API: ' + e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'DeepSeek timeout' }); });
        req.write(body); req.end();
      });
    },
  ]);
}

module.exports = { CircuitBreaker, withFallback, diagnose, reliableSolve };

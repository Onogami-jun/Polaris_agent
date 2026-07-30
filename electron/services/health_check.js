/**
 * Polaris Health Check — verify Agent environment at startup.
 */
const { spawnSync } = require('child_process');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');
const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';

// Try sandbox Python first, then system Python
function getBestPython() {
  const sandboxPy = path.join(os.homedir(), 'AppData', 'Roaming', 'polaris-agent', 'sandbox', 'python.exe');
  if (fs.existsSync(sandboxPy)) return sandboxPy;
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['-c', 'print("OK")'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
    if (r.status === 0 && r.stdout.includes('OK')) return cmd;
  }
  return null;
}

function checkPython() {
  const py = getBestPython();
  if (py) return { ok: true, cmd: py };
  return { ok: false, error: 'Python not found. Click "安装沙箱" to auto-install.' };
}

function checkPolaris(pythonCmd) {
  const r = spawnSync(pythonCmd, ['-c', 'from polaris import solve; print("POLARIS_OK")'], { timeout: 10000, encoding: 'utf8', windowsHide: true });
  if (r.status === 0 && r.stdout.includes('POLARIS_OK')) return { ok: true };
  return { ok: false, error: r.stderr?.slice(0, 300) || 'Polaris not installed. Click "安装沙箱" to auto-install.' };
}

function checkHiGHS(pythonCmd) {
  const r = spawnSync(pythonCmd, ['-c', 'from polaris.solvers.highs import HighsSolver; print("HIGHS_OK")'], { timeout: 10000, encoding: 'utf8', windowsHide: true });
  if (r.status === 0 && r.stdout.includes('HIGHS_OK')) return { ok: true };
  return { ok: false, error: 'highspy not installed. Auto-install with sandbox.' };
}

function checkDeepSeek(apiKey) {
  const key = apiKey || DEFAULT_KEY;
  return new Promise((res) => {
    const body = JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, resp => {
      let d = '';
      resp.on('data', c => d += c.toString());
      resp.on('end', () => {
        try { const j = JSON.parse(d); res({ ok: !!j.choices?.[0]?.message?.content }); }
        catch { res({ ok: false, error: 'DeepSeek API returned invalid JSON' }); }
      });
    });
    req.on('error', e => res({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); res({ ok: false, error: 'DeepSeek API timeout (10s)' }); });
    req.write(body); req.end();
  });
}

async function runHealthCheck() {
  const results = [];

  // Python
  const py = checkPython();
  results.push({ service: 'Python', ...py });
  if (!py.ok) {
    results.push({ service: 'Polaris Engine', ok: false, error: '需要 Python 3.11+', detail: 'pip install polaris-opt[highs]' });
    results.push({ service: 'HiGHS Solver', ok: false, error: '需要 Python', detail: '' });
  } else {
    const pol = checkPolaris(py.cmd);
    results.push({ service: 'Polaris Engine', ...pol, detail: pol.ok ? '' : 'pip install polaris-opt[highs]' });
    const highs = checkHiGHS(py.cmd);
    results.push({ service: 'HiGHS Solver', ...highs, detail: highs.ok ? '' : 'pip install highspy' });
  }

  // DeepSeek
  const ds = await checkDeepSeek();
  results.push({ service: 'DeepSeek API', ...ds });

  return results;
}

/** 生成 Agent 可用的工具状态摘要 */
function buildAgentCapabilityNote(results) {
  const engineOk = results.some(r => r.service === 'Polaris Engine' && r.ok);
  const pythonOk = results.some(r => r.service === 'Python' && r.ok);
  const apiOk = results.some(r => r.service === 'DeepSeek API' && r.ok);

  if (engineOk) return ''; // All good, no special note needed

  let note = '\n\n[系统环境] ';
  if (!pythonOk) {
    note += '用户本地未安装 Python。以下工具不可用：polaris_opt, polaris_decompose, polaris_research, polaris_analyze, polaris_model, run_code。请用你的知识直接分析问题、手算推理，给出理论最优解或近似解。如果用户只是想讨论问题类型和思路，正常对话即可。';
  } else if (!engineOk) {
    note += '用户已装 Python 但未装 polaris-opt 引擎。以下工具不可用：polaris_opt, polaris_decompose, polaris_research, polaris_analyze, polaris_model。请用 polaris_code 跑原生 Python 优化代码（PuLP/SciPy 等），或手算推理给出答案。告知用户运行 pip install polaris-opt[highs] 可解锁全部工具。';
  }
  if (!apiOk) {
    note += ' DeepSeek API 连接异常，可能影响推理质量。';
  }
  return note;
}

module.exports = { runHealthCheck, checkPython, checkPolaris, checkDeepSeek, buildAgentCapabilityNote };

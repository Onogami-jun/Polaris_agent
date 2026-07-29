/**
 * Polaris Health Check — verify Agent environment at startup.
 */
const { spawnSync } = require('child_process');
const https = require('https');
const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';

function checkPython() {
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['-c', 'print("OK")'], { timeout: 5000, encoding: 'utf8' });
    if (r.status === 0 && r.stdout.includes('OK')) return { ok: true, cmd };
  }
  return { ok: false, error: 'Python not found. Install Python 3.11+' };
}

function checkPolaris(pythonCmd) {
  const r = spawnSync(pythonCmd, ['-c', 'from polaris import solve; print("POLARIS_OK")'], { timeout: 10000, encoding: 'utf8' });
  if (r.status === 0 && r.stdout.includes('POLARIS_OK')) return { ok: true };
  return { ok: false, error: r.stderr?.slice(0, 300) || 'Polaris not installed. Run: pip install polaris-opt' };
}

function checkHiGHS(pythonCmd) {
  const r = spawnSync(pythonCmd, ['-c', 'from polaris.solvers.highs import HighsSolver; print("HIGHS_OK")'], { timeout: 10000, encoding: 'utf8' });
  if (r.status === 0 && r.stdout.includes('HIGHS_OK')) return { ok: true };
  return { ok: false, error: 'highspy not installed. Run: pip install highspy' };
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
  if (!py.ok) return results;

  // Polaris
  const pol = checkPolaris(py.cmd);
  results.push({ service: 'Polaris Engine', ...pol });

  // HiGHS
  const highs = checkHiGHS(py.cmd);
  results.push({ service: 'HiGHS Solver', ...highs });

  // DeepSeek
  const ds = await checkDeepSeek();
  results.push({ service: 'DeepSeek API', ...ds });

  return results;
}

module.exports = { runHealthCheck, checkPython, checkPolaris, checkDeepSeek };

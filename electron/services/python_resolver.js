/**
 * Polaris Python Resolver — single source of truth for finding Python executable
 * Used by: router, tools, reliability, health_check, planner, sandbox
 */
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

let _cachedPython = null;
let _cachedTime = 0;
const CACHE_TTL = 30000; // 30s

/**
 * Find the best available Python executable.
 * Priority: sandbox > system python3 > python
 */
function resolvePython(forceRefresh) {
  if (!forceRefresh && _cachedPython && Date.now() - _cachedTime < CACHE_TTL) {
    return _cachedPython;
  }

  // 1. Bundled sandbox
  const sandboxPy = path.join(os.homedir(), 'AppData', 'Roaming', 'polaris-agent', 'sandbox', 'python.exe');
  if (fs.existsSync(sandboxPy)) {
    const r = spawnSync(sandboxPy, ['-c', 'print("OK")'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
    if (r.status === 0 && r.stdout.includes('OK')) {
      _cachedPython = sandboxPy;
      _cachedTime = Date.now();
      return sandboxPy;
    }
  }

  // 2. System Python
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'print("OK")'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
    if (r.status === 0 && r.stdout.includes('OK')) {
      _cachedPython = cmd;
      _cachedTime = Date.now();
      return cmd;
    }
  }

  _cachedPython = null;
  return null;
}

/**
 * Run Python code with the resolved interpreter.
 */
function runPython(code, timeout = 60000) {
  const py = resolvePython();
  if (!py) return { success: false, error: 'Python 未安装。请在设置→沙箱中一键部署 Python 环境。' };
  const maxOut = 1_000_000;
  const r = spawnSync(py, ['-c', code], {
    timeout, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });
  return {
    success: r.status === 0,
    stdout: (r.stdout || '').slice(0, maxOut),
    stderr: (r.stderr || '').slice(0, 10000),
    exitCode: r.status,
  };
}

module.exports = { resolvePython, runPython };

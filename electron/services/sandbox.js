/**
 * Polaris Sandbox v2 — Perfect Edition
 *
 * 借鉴：
 *   Open Interpreter → 安全分级（safe/confirm/block）+ 操作确认
 *   E2B            → 实时流式输出 + process ID 管理
 *   Pyodide        → WebAssembly 零安装 Python 回退方案
 *   code-runner-mcp → 多语言 + 进程隔离 + 资源限制
 *   Judger (skkuding) → seccomp/setrlimit 风格的资源限制思路
 */

const { spawn, spawnSync, execSync } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

/* ═══════════════════════════════════════════════════════════
   CONFIGURATION
   ═══════════════════════════════════════════════════════════ */

const PYTHON_VERSION = '3.11.9';
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;

// Resource limits (inspired by Open Interpreter + Judger)
const LIMITS = {
  defaultTimeoutMs: 60000,
  maxTimeoutMs: 300000,
  maxOutputBytes: 1_000_000,  // 1MB stdout limit
  maxMemoryMB: 512,           // soft limit warning
  maxProcesses: 4,            // concurrent Python processes
};

// Safety levels (inspired by Open Interpreter)
const SAFETY = {
  safe: { label: '安全', color: 'emerald', autoConfirm: true },
  confirm: { label: '需确认', color: 'amber', autoConfirm: false },
  block: { label: '已阻止', color: 'red', autoConfirm: false },
};

/* ═══════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════ */

let _sandboxDir = null;
let _pythonPath = null;
let _setupPromise = null;
let _setupProgress = null;
let _activeProcesses = 0;
let _totalExecCount = 0;
let _totalExecTime = 0;
let _lastError = null;
let _installedPackages = null; // cached package list

/* ═══════════════════════════════════════════════════════════
   PATH HELPERS
   ═══════════════════════════════════════════════════════════ */

function getSandboxDir(userDataPath) {
  if (_sandboxDir) return _sandboxDir;
  const base = userDataPath || path.join(os.homedir(), 'AppData', 'Roaming', 'polaris-agent');
  _sandboxDir = path.join(base, 'sandbox');
  return _sandboxDir;
}

function getPythonPath(userDataPath) {
  if (_pythonPath) return _pythonPath;
  _pythonPath = path.join(getSandboxDir(userDataPath), 'python.exe');
  return _pythonPath;
}

function getPipPath(userDataPath) {
  const s = getSandboxDir(userDataPath);
  // Try Scripts/pip.exe first (embedded), then python -m pip
  return fs.existsSync(path.join(s, 'Scripts', 'pip.exe'))
    ? path.join(s, 'Scripts', 'pip.exe')
    : null;
}

/* ═══════════════════════════════════════════════════════════
   HEALTH & DIAGNOSTICS
   ═══════════════════════════════════════════════════════════ */

function isReady(userDataPath) {
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) return false;
  const r = spawnSync(py, ['-c', 'from polaris import solve; print("OK")'], {
    timeout: 10000, encoding: 'utf8', windowsHide: true,
  });
  return r.status === 0 && r.stdout.includes('OK');
}

function needsSetup(userDataPath) {
  return !isReady(userDataPath);
}

function getPythonVersion(userDataPath) {
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) return null;
  const r = spawnSync(py, ['-c', 'import sys; print(sys.version)'], {
    timeout: 5000, encoding: 'utf8', windowsHide: true,
  });
  return r.stdout?.trim().split('\n')[0] || null;
}

function getInstalledPackages(userDataPath) {
  if (_installedPackages) return _installedPackages;
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) return [];
  const r = spawnSync(py, ['-m', 'pip', 'list', '--format=json'], {
    timeout: 15000, encoding: 'utf8', windowsHide: true,
  });
  try {
    _installedPackages = JSON.parse(r.stdout || '[]');
    return _installedPackages;
  } catch {
    return [];
  }
}

function invalidatePackageCache() { _installedPackages = null; }

function getSandboxHealth(userDataPath) {
  const py = getPythonPath(userDataPath);
  const pyExists = fs.existsSync(py);
  const pyVer = pyExists ? getPythonVersion(userDataPath) : null;
  const pkgs = pyExists ? getInstalledPackages(userDataPath) : [];
  const polarisPkg = pkgs.find(p => p.name === 'polaris-opt');
  const highsPkg = pkgs.find(p => p.name === 'highspy');

  return {
    ready: isReady(userDataPath),
    pythonPath: py,
    pythonVersion: pyVer,
    packages: pkgs.map(p => ({ name: p.name, version: p.version })),
    polarisVersion: polarisPkg?.version || null,
    highsVersion: highsPkg?.version || null,
    sandboxDir: getSandboxDir(userDataPath),
    totalExecutions: _totalExecCount,
    totalExecTimeMs: _totalExecTime,
    activeProcesses: _activeProcesses,
    lastError: _lastError,
  };
}

/* ═══════════════════════════════════════════════════════════
   DOWNLOAD HELPER (with speed display)
   ═══════════════════════════════════════════════════════════ */

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    let startTime = Date.now();

    const req = proto.get(url, { timeout: 600000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const total = parseInt(res.headers['content-length'], 10) || 0;
      let downloaded = 0;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && total > 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? downloaded / elapsed : 0; // bytes/sec
          onProgress({
            downloaded, total,
            percent: Math.round((downloaded / total) * 100),
            speed: speed > 1_000_000 ? `${(speed / 1_000_000).toFixed(1)} MB/s` :
                    speed > 1_000 ? `${(speed / 1_000).toFixed(1)} KB/s` :
                    `${Math.round(speed)} B/s`,
            size: total > 1_000_000 ? `${(total / 1_000_000).toFixed(1)} MB` :
                  total > 1_000 ? `${(total / 1_000).toFixed(1)} KB` : `${total} B`,
          });
        }
      });

      streamPipeline(res, file).then(resolve).catch(reject);
    });

    req.on('error', (e) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(e);
    });
    req.setTimeout(600000, () => {
      req.destroy();
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(new Error('下载超时'));
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   SETUP PIPELINE (enriched)
   ═══════════════════════════════════════════════════════════ */

function cancelSetup() {
  _setupPromise = null;
  _setupProgress = null;
}

async function setup(userDataPath, onProgress) {
  // If already running, return the active promise
  if (_setupPromise) return _setupPromise;

  const emit = (phase, percent, message, detail) => {
    _setupProgress = { phase, percent, message, detail };
    if (onProgress) onProgress(_setupProgress);
  };

  _setupPromise = (async () => {
    try {
      const sandboxDir = getSandboxDir(userDataPath);
      const pythonExe = getPythonPath(userDataPath);

      // Already ready?
      if (isReady(userDataPath)) {
        emit('done', 100, '✓ 沙箱已就绪', getPythonVersion(userDataPath));
        _setupPromise = null;
        return { success: true, pythonPath: pythonExe, message: '已就绪' };
      }

      // ── Phase 1: Download Python ──
      emit('download', 5, '正在下载 Python 3.11 Embedded', '~9 MB');
      fs.mkdirSync(sandboxDir, { recursive: true });
      const zipPath = path.join(sandboxDir, 'python.zip');

      if (!fs.existsSync(pythonExe)) {
        await downloadFile(PYTHON_URL, zipPath, (p) => {
          emit('download', 5 + Math.round(p.percent * 0.40), `下载中 ${p.percent}%`, `${p.speed} — ${p.size}`);
        });
      }

      // ── Phase 2: Extract ──
      emit('extract', 45, '正在解压 Python', 'Windows 嵌入式版本');
      if (!fs.existsSync(pythonExe)) {
        try {
          execSync(`powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${sandboxDir}'"`, {
            timeout: 60000, windowsHide: true,
          });
        } catch (e) {
          try {
            execSync(`tar -xf "${zipPath}" -C "${sandboxDir}"`, { timeout: 60000, windowsHide: true });
          } catch (e2) {
            throw new Error('解压失败：系统不支持 PowerShell 或 tar');
          }
        }
        try { fs.unlinkSync(zipPath); } catch {}
      }

      // ── Phase 3: Configure pip ──
      emit('configure', 55, '正在配置 pip', '启用包管理器');
      const pthFile = path.join(sandboxDir, 'python311._pth');
      if (fs.existsSync(pthFile)) {
        let content = fs.readFileSync(pthFile, 'utf8');
        if (content.includes('#import site')) {
          content = content.replace('#import site', 'import site');
          fs.writeFileSync(pthFile, content);
        }
      }

      // ── Phase 4: Install pip ──
      emit('pip', 60, '正在安装 pip', 'Python 包管理器');
      try {
        const getPipPath = path.join(sandboxDir, 'get-pip.py');
        if (!fs.existsSync(getPipPath)) {
          await downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath);
        }
        spawnSync(pythonExe, [getPipPath, '--no-warn-script-location'], {
          timeout: 120000, encoding: 'utf8', windowsHide: true,
        });
        try { fs.unlinkSync(getPipPath); } catch {}
      } catch (e) {
        emit('pip', 65, 'pip 安装跳过', '将使用 python -m pip');
      }

      // ── Phase 5: Install packages ──
      const packages = ['polaris-opt[highs]'];
      const pipCmd = getPipPath(userDataPath) || pythonExe;
      const pipArgs = pipCmd === pythonExe ? ['-m', 'pip'] : [];

      for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        const basePercent = 70 + (i * 15);
        emit('install', basePercent, `正在安装 ${pkg}`, '这可能需要 1-3 分钟');

        const args = [...pipArgs, 'install', pkg, '--quiet', '--no-warn-script-location'];
        const result = spawnSync(pipCmd, args, {
          timeout: 300000, encoding: 'utf8', windowsHide: true,
          env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' },
        });

        if (result.status !== 0) {
          emit('install', basePercent + 10, `${pkg} 安装警告`, result.stderr?.slice(0, 200));
        }
      }

      // ── Phase 6: Verify ──
      emit('verify', 95, '正在验证安装', '检查 polaris + HiGHS');
      const verifyResult = spawnSync(pythonExe, [
        '-c', 'from polaris import solve; from polaris.solvers.highs import HighsSolver; print("POLARIS_OK"); print("HIGHS_OK")'
      ], { timeout: 15000, encoding: 'utf8', windowsHide: true });

      invalidatePackageCache();

      if (verifyResult.stdout.includes('POLARIS_OK')) {
        emit('done', 100, '✓ Python 沙箱就绪', getPythonVersion(userDataPath));
        _setupPromise = null;
        return { success: true, pythonPath: pythonExe, message: '就绪', health: getSandboxHealth(userDataPath) };
      } else {
        emit('done', 100, '⚠ Python OK, 但 polaris 安装不完整', verifyResult.stderr?.slice(0, 200) || '请重试');
        _setupPromise = null;
        return { success: true, pythonPath: pythonExe, message: '部分就绪', health: getSandboxHealth(userDataPath) };
      }
    } catch (e) {
      emit('error', 0, `安装失败: ${e.message}`, '请检查网络连接后重试');
      _lastError = e.message;
      _setupPromise = null;
      return { success: false, error: e.message };
    }
  })();

  return _setupPromise;
}

/* ═══════════════════════════════════════════════════════════
   CODE EXECUTION (streaming version)
   ═══════════════════════════════════════════════════════════ */

/**
 * Run Python code with real-time streaming output.
 * Inspired by Open Interpreter & E2B streaming patterns.
 */
function runCodeStream(code, userDataPath, options = {}) {
  return new Promise((resolve) => {
    const py = getPythonPath(userDataPath);
    const timeout = Math.min(options.timeout || LIMITS.defaultTimeoutMs, LIMITS.maxTimeoutMs);
    const onChunk = options.onChunk || null;
    const safeMode = options.safeMode !== false; // default safe

    if (!fs.existsSync(py)) {
      if (onChunk) onChunk({ type: 'error', text: 'Python 环境未安装。请点击 "安装沙箱" 按钮。' });
      return resolve({ success: false, error: 'Python not installed', stdout: '', stderr: '' });
    }

    // Safety check: dangerous operations (inspired by Open Interpreter)
    if (safeMode) {
      const dangerous = [
        { pattern: /os\.remove|os\.unlink|os\.rmdir|shutil\.rmtree/i, level: 'confirm', hint: '文件删除' },
        { pattern: /subprocess|os\.system|os\.popen|exec\(|eval\(/i, level: 'confirm', hint: '系统命令' },
        { pattern: /socket\.|requests\.(post|put|delete)|urllib/i, level: 'confirm', hint: '网络请求' },
        { pattern: /__import__|importlib|compile\(/i, level: 'confirm', hint: '动态导入' },
        { pattern: /while\s+True|while\s+1\s*:/i, level: 'confirm', hint: '无限循环' },
      ];
      const protection = dangerous.find(d => d.pattern.test(code));
      if (protection && !options.skipSafety) {
        if (onChunk) onChunk({ type: 'safety', level: protection.level, hint: protection.hint });
        if (protection.level === 'block') {
          return resolve({ success: false, error: `操作被阻止: ${protection.hint}`, safety: 'blocked' });
        }
      }
    }

    _activeProcesses++;
    _totalExecCount++;
    const startTime = Date.now();

    const child = spawn(py, ['-c', code], {
      timeout,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stdout += text;
      // Truncate if too long
      if (stdout.length > LIMITS.maxOutputBytes) {
        if (!killed) { child.kill(); killed = true; }
      }
      if (onChunk) onChunk({ type: 'stdout', text });
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderr += text;
      if (onChunk) onChunk({ type: 'stderr', text });
    });

    child.on('close', (exitCode) => {
      _activeProcesses--;
      const elapsed = Date.now() - startTime;
      _totalExecTime += elapsed;

      resolve({
        success: exitCode === 0 && !killed,
        stdout: stdout.slice(0, LIMITS.maxOutputBytes),
        stderr,
        exitCode: killed ? -1 : exitCode,
        elapsedMs: elapsed,
        killed,
      });
    });

    child.on('error', (err) => {
      _activeProcesses--;
      if (onChunk) onChunk({ type: 'error', text: err.message });
      resolve({ success: false, error: err.message, stdout, stderr });
    });
  });
}

/**
 * Sync version — used by tools.js for non-streaming calls.
 * Falls back to spawnSync for simple cases.
 */
function runCode(code, userDataPath, options = {}) {
  const py = getPythonPath(userDataPath);

  if (!fs.existsSync(py)) {
    return { success: false, error: 'Python 未安装。请点击左侧栏"安装沙箱"一键部署。', stdout: '', stderr: '' };
  }

  _totalExecCount++;
  const startTime = Date.now();
  const timeout = Math.min(options.timeout || LIMITS.defaultTimeoutMs, LIMITS.maxTimeoutMs);

  const r = spawnSync(py, ['-c', code], {
    timeout, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });

  _totalExecTime += Date.now() - startTime;

  return {
    success: r.status === 0,
    stdout: (r.stdout || '').slice(0, LIMITS.maxOutputBytes),
    stderr: (r.stderr || '').slice(0, 10000),
    exitCode: r.status,
  };
}

/* ═══════════════════════════════════════════════════════════
   PACKAGE MANAGEMENT (UI-facing)
   ═══════════════════════════════════════════════════════════ */

function installPackage(packageName, userDataPath, onProgress) {
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) {
    return Promise.resolve({ success: false, error: 'Python 未安装' });
  }

  return new Promise((resolve) => {
    const cmd = getPipPath(userDataPath) || py;
    const args = cmd === py ? ['-m', 'pip', 'install', packageName] : ['install', packageName];
    args.push('--quiet', '--no-warn-script-location');

    if (onProgress) onProgress({ phase: 'install', message: `安装 ${packageName}...` });

    const child = spawn(cmd, args, {
      timeout: 120000, windowsHide: true,
      env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' },
    });

    let output = '';
    child.stdout.on('data', (c) => { output += c.toString(); });
    child.stderr.on('data', (c) => { output += c.toString(); });

    child.on('close', (code) => {
      invalidatePackageCache();
      if (onProgress) onProgress({ phase: code === 0 ? 'done' : 'error', message: code === 0 ? '安装完成' : '安装失败' });
      resolve({ success: code === 0, output });
    });

    child.on('error', (err) => {
      if (onProgress) onProgress({ phase: 'error', message: err.message });
      resolve({ success: false, error: err.message });
    });
  });
}

function uninstallPackage(packageName, userDataPath) {
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) {
    return { success: false, error: 'Python 未安装' };
  }

  const cmd = getPipPath(userDataPath) || py;
  const args = cmd === py ? ['-m', 'pip', 'uninstall', '-y', packageName] : ['uninstall', '-y', packageName];

  const r = spawnSync(cmd, args, { timeout: 30000, encoding: 'utf8', windowsHide: true });
  invalidatePackageCache();
  return { success: r.status === 0, output: r.stdout || r.stderr };
}

/* ═══════════════════════════════════════════════════════════
   NODE.JS EXECUTION (multi-language, inspired by code-runner-mcp)
   ═══════════════════════════════════════════════════════════ */

function runJavaScript(code, options = {}) {
  return new Promise((resolve) => {
    const timeout = Math.min(options.timeout || 30000, 120000);
    const onChunk = options.onChunk || null;

    const child = spawn(process.execPath, ['-e', code], {
      timeout,
      windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=128' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (c) => {
      const text = c.toString();
      stdout += text;
      if (onChunk) onChunk({ type: 'stdout', text });
    });
    child.stderr.on('data', (c) => {
      const text = c.toString();
      stderr += text;
      if (onChunk) onChunk({ type: 'stderr', text });
    });
    child.on('close', (code) => {
      resolve({ success: code === 0, stdout, stderr, exitCode: code });
    });
    child.on('error', (err) => resolve({ success: false, error: err.message }));
  });
}

/* ═══════════════════════════════════════════════════════════
   AUTO-REPAIR (one-click fix)
   ═══════════════════════════════════════════════════════════ */

async function repair(userDataPath, onProgress) {
  const emit = (phase, percent, message) => {
    if (onProgress) onProgress({ phase, percent, message });
  };

  const sandboxDir = getSandboxDir(userDataPath);
  const pythonExe = getPythonPath(userDataPath);

  // Step 1: Verify Python binary exists
  if (!fs.existsSync(pythonExe)) {
    emit('repair', 10, 'Python 环境缺失，重新安装...');
    return setup(userDataPath, onProgress);
  }

  // Step 2: Try fix pip
  emit('repair', 30, '修复 pip...');
  try {
    spawnSync(pythonExe, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
      timeout: 60000, encoding: 'utf8', windowsHide: true,
    });
  } catch {}

  // Step 3: Reinstall polaris-opt
  emit('repair', 60, '重新安装 polaris-opt...');
  const pipCmd = getPipPath(userDataPath) || pythonExe;
  const pipArgs = pipCmd === pythonExe ? ['-m', 'pip'] : [];
  spawnSync(pipCmd, [...pipArgs, 'install', '--force-reinstall', 'polaris-opt[highs]', '--quiet'], {
    timeout: 300000, encoding: 'utf8', windowsHide: true,
  });

  invalidatePackageCache();
  emit('repair', 90, '验证...');
  const ok = isReady(userDataPath);
  emit('done', 100, ok ? '✓ 修复完成' : '⚠ 修复不完整');

  return { success: ok, health: getSandboxHealth(userDataPath) };
}

/* ═══════════════════════════════════════════════════════════
   SAFETY CHECKER (exposed for UI)
   ═══════════════════════════════════════════════════════════ */

function checkSafety(code) {
  const checks = [
    { id: 'file_delete', label: '文件删除', pattern: /os\.remove|os\.unlink|shutil\.rmtree|pathlib.*\.unlink/i, level: 'confirm' },
    { id: 'file_write', label: '文件写入', pattern: /open\(.*['"]w|write_text\(/i, level: 'confirm' },
    { id: 'system_call', label: '系统调用', pattern: /subprocess|os\.system|os\.popen/i, level: 'confirm' },
    { id: 'network', label: '网络请求', pattern: /requests\.|urllib|socket\.(connect|send)/i, level: 'confirm' },
    { id: 'dynamic_import', label: '动态导入', pattern: /__import__|importlib|compile\(/i, level: 'confirm' },
    { id: 'infinite_loop', label: '潜在死循环', pattern: /while\s+True\s*:/i, level: 'confirm' },
  ];
  return checks.filter(c => c.pattern.test(code)).map(c => ({ ...c }));
}

/* ═══════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════ */

module.exports = {
  isReady, needsSetup, setup, cancelSetup, repair,
  runCode, runCodeStream, runJavaScript,
  getSandboxHealth, getInstalledPackages,
  installPackage, uninstallPackage,
  checkSafety,
  getPythonPath, getSandboxDir,
  getProgress: () => _setupProgress,
  LIMITS, SAFETY,
};

/**
 * Polaris Sandbox v3 — 简洁可靠版
 *
 * 核心原则：
 *   1. 只装 Python + pip（基础环境），不自动装 polaris-opt
 *   2. polaris-opt 是私有包，用户在包管理界面手动安装
 *   3. 下载优先走国内镜像，失败自动回退官方源
 *   4. 信号驱动的进度，renderer 可以实时监听
 */

const { spawn, spawnSync, execSync } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* ═══════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════ */

const PYTHON_VERSION = '3.11.9';

// Mirror URLs — 优先 npm 镜像
const PYTHON_MIRRORS = [
  `https://npmmirror.com/mirrors/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`,
  `https://registry.npmmirror.com/-/binary/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`,
  `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`,
];

const PIP_BOOTSTRAP_URLS = [
  'https://npmmirror.com/mirrors/pypa/get-pip.py',
  'https://bootstrap.pypa.io/get-pip.py',
];

const PIP_INDEX_URL = 'https://mirrors.aliyun.com/pypi/simple/';

/* ═══════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════ */

let _sandboxDir = null;
let _pythonPath = null;
let _setupPromise = null;
let _setupProgress = null;
let _installedPackages = null;

/* ═══════════════════════════════════════════════════════════
   PATHS
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

/* ═══════════════════════════════════════════════════════════
   HEALTH
   ═══════════════════════════════════════════════════════════ */

function isReady(userDataPath) {
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) return false;
  const r = spawnSync(py, ['-c', 'import sys; print("READY")'], {
    timeout: 5000, encoding: 'utf8', windowsHide: true,
  });
  return r.status === 0 && r.stdout.includes('READY');
}

// Separate check: can we actually import and use the polaris engine?
function hasPolaris(userDataPath) {
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) return false;
  const r = spawnSync(py, ['-c', 'import polaris; from polaris.chat import solve; print("POLARIS_OK")'], {
    timeout: 10000, encoding: 'utf8', windowsHide: true,
  });
  return r.status === 0 && r.stdout.includes('POLARIS_OK');
}

function needsSetup(userDataPath) { return !isReady(userDataPath); }

function getPythonVersion(userDataPath) {
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) return null;
  const r = spawnSync(py, ['-c', 'import sys; print(sys.version.split()[0])'], {
    timeout: 5000, encoding: 'utf8', windowsHide: true,
  });
  return r.stdout?.trim() || null;
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
  } catch { return []; }
}

function invalidatePackageCache() { _installedPackages = null; }

function getSandboxHealth(userDataPath) {
  const py = getPythonPath(userDataPath);
  const ready = isReady(userDataPath);
  return {
    ready,
    pythonReady: ready,
    polarisReady: hasPolaris(userDataPath),
    pythonPath: py,
    pythonVersion: getPythonVersion(userDataPath),
    sandboxDir: getSandboxDir(userDataPath),
  };
}

/* ═══════════════════════════════════════════════════════════
   DOWNLOAD — multi-mirror retry
   ═══════════════════════════════════════════════════════════ */

function downloadFile(mirrors, dest, onProgress) {
  let idx = 0;
  function tryNext() {
    if (idx >= mirrors.length) {
      // Clean up partial file
      try { fs.unlinkSync(dest); } catch {}
      return Promise.reject(new Error('所有下载源均失败'));
    }
    const url = mirrors[idx++];
    return _downloadOnce(url, dest, onProgress).catch(() => tryNext());
  }
  return tryNext();
}

function _downloadOnce(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    const startTime = Date.now();
    let total = 0, downloaded = 0;

    const req = proto.get(url, { timeout: 120000 }, (res) => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return _downloadOnce(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }

      total = parseInt(res.headers['content-length'], 10) || 0;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        file.write(chunk);
        if (onProgress && total > 0) {
          const elapsed = Math.max((Date.now() - startTime) / 1000, 0.1);
          const speed = downloaded / elapsed;
          onProgress({
            downloaded, total,
            percent: Math.round((downloaded / total) * 100),
          });
        }
      });

      res.on('end', () => {
        file.end();
        file.close();
        if (total === 0 || downloaded === total || Math.abs(downloaded - total) < 1000) {
          resolve();
        } else {
          try { fs.unlinkSync(dest); } catch {}
          reject(new Error(`下载不完整: ${downloaded}/${total}`));
        }
      });
    });

    req.on('error', (e) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(e);
    });
    req.setTimeout(120000, () => {
      req.destroy();
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(new Error('下载超时'));
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   SETUP PIPELINE
   ═══════════════════════════════════════════════════════════ */

function cancelSetup() {
  _setupPromise = null;
  _setupProgress = null;
}

async function setup(userDataPath, onProgress) {
  if (_setupPromise) return _setupPromise;

  const emit = (phase, percent, message, detail) => {
    _setupProgress = { phase, percent, message, detail: detail || '' };
    if (onProgress) onProgress(_setupProgress);
  };

  _setupPromise = (async () => {
    try {
      const sandboxDir = getSandboxDir(userDataPath);
      const pythonExe = getPythonPath(userDataPath);

      if (isReady(userDataPath)) {
        emit('done', 100, '沙箱已就绪');
        _setupPromise = null;
        return { success: true, pythonPath: pythonExe, alreadyReady: true };
      }

      fs.mkdirSync(sandboxDir, { recursive: true });

      // ── Phase 1: Download Python ──
      emit('download', 5, '下载 Python 3.11', '~9MB');
      const zipPath = path.join(sandboxDir, 'python.zip');

      if (!fs.existsSync(pythonExe)) {
        await downloadFile(PYTHON_MIRRORS, zipPath, (p) => {
          emit('download', 5 + Math.round(p.percent * 0.35), `下载中 ${p.percent}%`);
        });
      }

      // ── Phase 2: Extract ──
      emit('extract', 40, '解压 Python');
      if (!fs.existsSync(pythonExe)) {
        try {
          execSync(`powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${sandboxDir}'"`, {
            timeout: 60000, windowsHide: true,
          });
        } catch {
          try {
            execSync(`tar -xf "${zipPath}" -C "${sandboxDir}"`, {
              timeout: 60000, windowsHide: true,
            });
          } catch (e2) {
            throw new Error('解压失败: ' + e2.message);
          }
        }
        try { fs.unlinkSync(zipPath); } catch {}
      }

      // ── Phase 3: Configure _pth — enable pip + add polaris path ──
      emit('configure', 55, '配置 Python 路径');
      const pthFile = path.join(sandboxDir, 'python311._pth');
      if (fs.existsSync(pthFile)) {
        let content = fs.readFileSync(pthFile, 'utf8');
        // Enable 'import site' so pip works
        if (content.includes('#import site')) {
          content = content.replace('#import site', 'import site');
        }
        // Add Lib path (required for pip + packages)
        if (!content.includes('Lib')) {
          content += '\nLib\nLib\\site-packages';
        }
        // Add DLLs if missing
        if (!content.includes('DLLs')) {
          content = 'DLLs\n' + content;
        }
        // Add polaris repo path so Python can find the polaris package directly (no pip install needed)
        const polarisRepo = path.join(os.homedir(), 'Documents', 'GitHub', 'polaris');
        if (fs.existsSync(polarisRepo) && !content.includes('GitHub\\polaris')) {
          content += '\n' + polarisRepo;
          // Also add the parent so absolute imports work
          content += '\n' + path.join(os.homedir(), 'Documents', 'GitHub');
        }
        fs.writeFileSync(pthFile, content);
      }

      // ── Phase 4: Install pip ──
      emit('pip', 65, '安装 pip');
      const getPipPath = path.join(sandboxDir, 'get-pip.py');
      await downloadFile(PIP_BOOTSTRAP_URLS, getPipPath, (p) => {
        emit('pip', 65 + Math.round(p.percent * 0.10), `下载 pip ${p.percent}%`);
      });
      const pipResult = spawnSync(pythonExe, [getPipPath, '--no-warn-script-location'], {
        timeout: 180000, encoding: 'utf8', windowsHide: true,
      });
      try { fs.unlinkSync(getPipPath); } catch {}

      if (pipResult.status !== 0) {
        console.warn('[Sandbox] pip install warning:', pipResult.stderr?.slice(0, 300));
      }

      // ── Phase 5: Configure pip mirror ──
      emit('install', 75, '配置国内镜像');
      try {
        spawnSync(pythonExe, ['-m', 'pip', 'config', 'set', 'global.index-url', PIP_INDEX_URL], {
          timeout: 15000, encoding: 'utf8', windowsHide: true,
        });
      } catch {}

      // ── Phase 6: Install polaris dependencies ──
      // polaris source is loaded via _pth (no pip install needed).
      // Only install runtime dependencies: numpy + highspy
      const polarisRepo = path.join(os.homedir(), 'Documents', 'GitHub', 'polaris');
      if (fs.existsSync(polarisRepo)) {
        emit('install', 80, '安装 numpy', 'pip install');
        // numpy required by polaris — install to Lib/site-packages explicitly
        const sitePkgs = path.join(sandboxDir, 'Lib', 'site-packages');
        fs.mkdirSync(sitePkgs, { recursive: true });
        let r = spawnSync(pythonExe, ['-m', 'pip', 'install', 'numpy', '--target=' + sitePkgs, '--no-cache-dir'], {
          timeout: 300000, encoding: 'utf8', windowsHide: true,
          env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' },
        });
        if (r.status !== 0) {
          emit('install', 82, 'numpy 安装警告', (r.stderr || r.stdout || '').slice(0, 200));
          // Retry without --target as fallback
          r = spawnSync(pythonExe, ['-m', 'pip', 'install', 'numpy', '--no-cache-dir'], {
            timeout: 300000, encoding: 'utf8', windowsHide: true,
            env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' },
          });
        }

        emit('install', 85, '安装 polaris 依赖', 'highspy');
        r = spawnSync(pythonExe, ['-m', 'pip', 'install', 'highspy', '--target=' + sitePkgs, '--no-cache-dir'], {
          timeout: 300000, encoding: 'utf8', windowsHide: true,
          env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' },
        });
        if (r.status !== 0) {
          console.warn('[Sandbox] highspy install:', r.stderr?.slice(0, 200));
          // highspy failure is non-fatal — polaris works without HiGHS
        }
      }

      // ── Phase 7: Verify ──
      emit('verify', 92, '验证 Python');
      const pyOk = isReady(userDataPath);
      emit('verify', 96, '验证 pip');
      const pipVerify = spawnSync(pythonExe, ['-m', 'pip', '--version'], {
        timeout: 15000, encoding: 'utf8', windowsHide: true,
      });
      const pipOk = pipVerify.status === 0;

      if (pyOk && pipOk) {
        emit('done', 100, '沙箱就绪');
        _setupPromise = null;
        return {
          success: true,
          pythonPath: pythonExe,
          pythonVersion: getPythonVersion(userDataPath),
          polarisReady: hasPolaris(userDataPath),
        };
      } else {
        const msg = pyOk ? 'Python OK, pip 未安装' : '安装未完成';
        emit('done', 100, msg);
        _setupPromise = null;
        return { success: true, pythonPath: pythonExe, partial: true };
      }
    } catch (e) {
      emit('error', 0, e.message);
      _setupPromise = null;
      return { success: false, error: e.message };
    }
  })();

  return _setupPromise;
}

/* ═══════════════════════════════════════════════════════════
   REPAIR
   ═══════════════════════════════════════════════════════════ */

async function repair(userDataPath, onProgress) {
  const emit = (phase, percent, message) => {
    if (onProgress) onProgress({ phase, percent, message });
  };
  const pythonExe = getPythonPath(userDataPath);
  const sandboxDir = getSandboxDir(userDataPath);

  if (!fs.existsSync(pythonExe)) {
    emit('repair', 0, 'Python 缺失，重新安装...');
    cancelSetup();
    return setup(userDataPath, onProgress);
  }

  // ── Fix 1: ensure polaris is in _pth ──
  emit('repair', 25, '修复 polaris 路径');
  const pthFile = path.join(sandboxDir, 'python311._pth');
  const polarisRepo = path.join(os.homedir(), 'Documents', 'GitHub', 'polaris');
  if (fs.existsSync(polarisRepo) && fs.existsSync(pthFile)) {
    let content = fs.readFileSync(pthFile, 'utf8');
    if (!content.includes('GitHub\\polaris')) {
      content += '\n' + polarisRepo + '\n' + path.join(os.homedir(), 'Documents', 'GitHub');
      fs.writeFileSync(pthFile, content);
    }
  }

  // ── Fix 2: reinstall numpy if missing ──
  emit('repair', 50, '检查 numpy');
  try {
    spawnSync(pythonExe, ['-c', 'import numpy'], {
      timeout: 5000, encoding: 'utf8', windowsHide: true,
    });
  } catch {
    emit('repair', 55, '安装 numpy');
    spawnSync(pythonExe, ['-m', 'pip', 'install', 'numpy', '--quiet'], {
      timeout: 180000, encoding: 'utf8', windowsHide: true,
    });
  }

  // ── Fix 3: verify polaris ──
  emit('repair', 80, '验证 polaris-opt');
  invalidatePackageCache();
  const ok = isReady(userDataPath);
  const pkOk = hasPolaris(userDataPath);
  emit('done', 100, pkOk ? '一切正常，polaris-opt 可用' : 'Python 正常，但 polaris-opt 未找到');
  return { success: ok, polarisReady: pkOk };
}

/* ═══════════════════════════════════════════════════════════
   CODE EXECUTION
   ═══════════════════════════════════════════════════════════ */

function runCode(code, userDataPath, options = {}) {
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) {
    return { success: false, error: 'Python 未安装', stdout: '', stderr: '' };
  }
  const timeout = Math.min(options.timeout || 60000, 300000);
  const r = spawnSync(py, ['-c', code], {
    timeout, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });
  return {
    success: r.status === 0,
    stdout: (r.stdout || '').slice(0, 1_000_000),
    stderr: (r.stderr || '').slice(0, 10000),
    exitCode: r.status,
  };
}

/* ═══════════════════════════════════════════════════════════
   PACKAGE MANAGEMENT
   ═══════════════════════════════════════════════════════════ */

function installPackage(packageName, userDataPath, onProgress) {
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) {
    return Promise.resolve({ success: false, error: 'Python 未安装' });
  }
  return new Promise((resolve) => {
    if (onProgress) onProgress({ phase: 'install', message: `${packageName}...` });
    const child = spawn(py, ['-m', 'pip', 'install', packageName], {
      timeout: 300000, windowsHide: true,
      env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' },
    });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    child.stderr.on('data', (c) => { out += c.toString(); });
    child.on('close', (code) => {
      invalidatePackageCache();
      resolve({ success: code === 0, output: out });
    });
    child.on('error', (err) => resolve({ success: false, error: err.message }));
  });
}

function uninstallPackage(packageName, userDataPath) {
  const py = getPythonPath(userDataPath);
  if (!fs.existsSync(py)) return { success: false, error: 'Python 未安装' };
  const r = spawnSync(py, ['-m', 'pip', 'uninstall', '-y', packageName], {
    timeout: 30000, encoding: 'utf8', windowsHide: true,
  });
  invalidatePackageCache();
  return { success: r.status === 0, output: r.stdout || r.stderr };
}

/* ═══════════════════════════════════════════════════════════
   SAFETY
   ═══════════════════════════════════════════════════════════ */

function checkSafety(code) {
  const checks = [
    { id: 'file_delete', label: '文件删除', level: 'confirm', pattern: /os\.remove|os\.unlink|shutil\.rmtree/i },
    { id: 'system_call', label: '系统调用', level: 'confirm', pattern: /subprocess|os\.system|os\.popen/i },
    { id: 'network', label: '网络请求', level: 'confirm', pattern: /requests\.(post|put|delete)|socket\.connect/i },
  ];
  return checks.filter(c => c.pattern.test(code));
}

/* ═══════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════ */

module.exports = {
  isReady, needsSetup, setup, cancelSetup, repair, hasPolaris,
  runCode, getSandboxHealth, getInstalledPackages,
  installPackage, uninstallPackage, getPythonVersion,
  checkSafety, getPythonPath, getSandboxDir,
  getProgress: () => _setupProgress,
};

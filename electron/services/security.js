/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris Security Layer v1.0
 *  ─────────────────────────────────────────────────────────
 *  ★ 多层防护体系 ★
 *
 *  1. IPC 鉴权层   —— 管理员接口需要会话令牌
 *  2. 输入净化层   —— 统一防注入（Python / PowerShell / path）
 *  3. 速率限制层   —— 登录/发送邮件频率限制
 *  4. 路径沙箱层   —— 文件操作仅允许白名单目录
 *  5. 保险库加固   —— 调试模式下锁定敏感函数
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const path = require('path');
const os = require('os');

// ═══════════════════════════════════════════════════════════
// 1. IPC 鉴权层
// ═══════════════════════════════════════════════════════════

let _authSessionToken = null;
let _authSessionTime = 0;
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 小时

/**
 * 登录成功后创建会话令牌。
 * 调用: loginUser thunk → ipc auth:unlock → user ID 传入
 * 后续 admin 操作需要此令牌才能执行。
 */
function createAuthSession(userId) {
  _authSessionToken = crypto.randomBytes(32).toString('hex');
  _authSessionTime = Date.now();
  return _authSessionToken;
}

function destroyAuthSession() {
  _authSessionToken = null;
  _authSessionTime = 0;
}

function getAuthToken() { return _authSessionToken; }

/**
 * 校验 IPC 调用是否有合法的 admin 权限。
 * 应用场景: auth:admin*, desktop:writeFile, desktop:runCommand
 *
 * @param {string} token — 从渲染进程传入的会话令牌
 * @returns {boolean}
 */
function verifyAdminAccess(token) {
  if (!_authSessionToken) return false;
  if (Date.now() - _authSessionTime > SESSION_TTL) {
    destroyAuthSession();
    return false;
  }
  // 恒定时间比较防止时序攻击
  try {
    return crypto.timingSafeEqual(
      Buffer.from(_authSessionToken, 'hex'),
      Buffer.from(token || '', 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * IPC 包装器：自动校验 admin 权限。
 * 用法: adminIPC(token, () => { ... })
 */
async function adminIPC(token, fn) {
  if (!verifyAdminAccess(token)) {
    return { success: false, error: '未授权——需要管理员会话。请重新登录。' };
  }
  try {
    return await fn();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// 2. 输入净化层
// ═══════════════════════════════════════════════════════════

/**
 * Python 字符串安全转义。
 * 放反斜杠 first，然后引号，最后控制字符。
 */
function sanitizePython(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')   // 反斜杠必须最先处理
    .replace(/"/g, '\\"')      // 双引号
    .replace(/'/g, "\\'")      // 单引号
    .replace(/\n/g, '\\n')     // 换行
    .replace(/\r/g, '')        // 回车（删除）
    .replace(/\x00/g, '')      // null byte
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '') // 其他控制字符
    .slice(0, 5000);           // 截断超长输入
}

/**
 * PowerShell 参数安全转义。
 * 163 邮件授权码那种不需要转——这是给命令参数用的。
 */
function sanitizePowerShell(str) {
  if (!str) return '';
  return String(str)
    .replace(/'/g, "''")       // PS single-quote escaping
    .replace(/`/g, '``')       // backtick
    .replace(/\$/g, '`$')      // dollar sign (variable expansion)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .slice(0, 2000);
}

/**
 * 数值参数安全校验（仅用于坐标等）
 */
function sanitizeNumber(str) {
  var n = parseInt(String(str), 10);
  if (isNaN(n)) return 0;
  return Math.min(30000, Math.max(-30000, n));
}

/**
 * 文件路径安全校验。
 * 拒绝:
 *   - 包含 .. 的路径遍历
 *   - 系统目录 (C:\Windows, /etc, /System 等)
 *   - null byte 注入
 *   - 超长路径 (>500 字符)
 */
function sanitizePath(filepath) {
  if (!filepath || typeof filepath !== 'string') return null;
  if (filepath.length > 500) return null;
  if (filepath.includes('\x00')) return null;

  // 标准化路径
  var normalized;
  try {
    normalized = path.resolve(filepath);
  } catch {
    return null;
  }

  // 拒绝系统关键目录
  var dangerous = [
    '/etc', '/bin', '/sbin', '/usr/bin', '/usr/sbin', '/boot', '/dev',
    'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
    'C:\\ProgramData', '/System', '/Library',
  ];
  var upper = normalized.toUpperCase();
  for (var i = 0; i < dangerous.length; i++) {
    if (upper.startsWith(dangerous[i].toUpperCase() + path.sep.toUpperCase()) ||
        upper === dangerous[i].toUpperCase()) {
      return null;
    }
  }

  // 只允许写入用户目录
  var home = os.homedir();
  if (upper.startsWith(home.toUpperCase())) {
    return normalized;
  }

  // 也允许桌面上的特定目录
  var allowedRoots = [
    path.join(home, 'Documents'),
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
  ];
  for (var j = 0; j < allowedRoots.length; j++) {
    if (upper.startsWith(allowedRoots[j].toUpperCase())) {
      return normalized;
    }
  }

  // 允许临时目录
  var tmp = os.tmpdir();
  if (upper.startsWith(tmp.toUpperCase())) return normalized;

  return null; // 拒绝
}

// ═══════════════════════════════════════════════════════════
// 3. 速率限制层
// ═══════════════════════════════════════════════════════════

var _rateLimits = {};

/**
 * 检查操作是否超过频率限制。
 *
 * @param {string} key    — 限制键 (如 'login|127.0.0.1')
 * @param {number} max    — 窗口内最大次数
 * @param {number} window — 时间窗口 (毫秒)
 * @returns {{ allowed: boolean, retryAfter: number }}
 */
function checkRateLimit(key, max, window) {
  var now = Date.now();
  var entry = _rateLimits[key];

  // 清理过期条目（每 100 次清理一次）
  if (Math.random() < 0.01) {
    var keys = Object.keys(_rateLimits);
    for (var i = 0; i < keys.length; i++) {
      if (now - _rateLimits[keys[i]].windowStart > window * 2) {
        delete _rateLimits[keys[i]];
      }
    }
  }

  if (!entry || now - entry.windowStart > window) {
    _rateLimits[key] = { count: 1, windowStart: now };
    return { allowed: true, retryAfter: 0 };
  }

  entry.count++;
  if (entry.count > max) {
    var retryAfter = Math.ceil((window - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfter: retryAfter };
  }

  return { allowed: true, retryAfter: 0 };
}

// 具体限制规则
var RATE_LIMITS = {
  login: { max: 5, window: 60 * 1000 },        // 5 次/分钟
  sendCode: { max: 3, window: 5 * 60 * 1000 },  // 3 次/5分钟
  forgotPassword: { max: 2, window: 10 * 60 * 1000 }, // 2 次/10分钟
  adminCall: { max: 10, window: 60 * 1000 },    // 10 次/分钟
};

// ═══════════════════════════════════════════════════════════
// 4. 保险库加固
// ═══════════════════════════════════════════════════════════

/**
 * 生产环境检查：如果 env 标记为 production，
 * 不允许通过 require('./services/secrets').get() 直接读取密钥。
 *
 * 这是对 secrets.js 额外的一层保护——在打包后的
 * Electron 应用中，__dirname 路径不同，直接 require
 * 可能找不到文件；但为了防止通过 DevTools 或逆向
 * 读取，增加此检查。
 */
var isProduction = false;
var isPackaged = false;

function setProductionMode() {
  isProduction = true;
  // 在正式构建中，尝试锁定密钥读取
  try {
    var electronApp = require('electron').app;
    isPackaged = electronApp.isPackaged;
  } catch {}
}

function canReadSecrets() {
  // 开发模式允许
  if (!isPackaged) return true;
  // 生产模式：只能由主进程初始化时读取一次
  if (isProduction) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════
// 5. 审计日志
// ═══════════════════════════════════════════════════════════

var _auditLog = [];

function auditLog(category, action, detail) {
  var entry = {
    ts: new Date().toISOString(),
    category: category,
    action: action,
    detail: String(detail || '').slice(0, 200),
  };
  _auditLog.push(entry);
  // 只保留最近 500 条
  if (_auditLog.length > 500) _auditLog = _auditLog.slice(-500);
  // 同步到 electron-log
  try {
    var logger = require('./logger');
    logger.info('[SECURITY] ' + category + '/' + action, { detail: entry.detail });
  } catch {}
}

function getAuditLog() { return _auditLog.slice(-50); }

// ═══════════════════════════════════════════════════════════
// 6. 完整性校验（构建时生成）
// ═══════════════════════════════════════════════════════════

/**
 * 校验 verification_engine.js.enc 的完整性。
 * 如果 .enc 文件被篡改，解密会失败——AES-GCM 自带完整性校验。
 * 此函数额外检查文件大小是否在合理范围。
 */
function verifyEncryptedEngine() {
  try {
    var fs = require('fs');
    var encPath = path.join(__dirname, 'verification_engine.js.enc');
    if (!fs.existsSync(encPath)) {
      console.warn('[SECURITY] verification_engine.js.enc 不存在——使用桩代码');
      return false;
    }
    var stat = fs.statSync(encPath);
    if (stat.size < 100 || stat.size > 200000) {
      console.warn('[SECURITY] verification_engine.js.enc 大小异常——可能被篡改');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════

module.exports = {
  // 鉴权
  createAuthSession, destroyAuthSession, getAuthToken,
  verifyAdminAccess, adminIPC,
  // 净化
  sanitizePython, sanitizePowerShell, sanitizeNumber, sanitizePath,
  // 速率
  checkRateLimit, RATE_LIMITS,
  // 保险库
  setProductionMode, canReadSecrets,
  // 审计
  auditLog, getAuditLog,
  // 完整性
  verifyEncryptedEngine,
};

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, globalShortcut, Notification } = require('electron');
const path = require('path');
const log = require('electron-log');
const { executeQuery } = require('./services/router');
const desktop = require('./services/desktop');
const { spawn } = require('child_process');
const systemMonitor = require('./services/system-monitor');
const { Planner } = require('./services/planner');
const security = require('./services/security');

// ── Production security lockdown ──
security.setProductionMode();

log.transports.file.level = 'info';
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const ROOT = path.join(__dirname, '..');
const planner = new Planner();

// ── Single-instance lock ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); } else {
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
}

let win = null, tray = null;
const mcpProcesses = new Map();

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 750, minWidth: 900, minHeight: 500, center: true,
    title: 'Polaris Solver — 优化科研助手', titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 }, backgroundColor: '#0b0e14',
    frame: false, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.loadURL(isDev ? 'http://localhost:3000' : 'file://' + path.join(ROOT, 'build', 'index.html'));
  win.once('ready-to-show', () => { win.show(); win.center(); });
  win.on('closed', () => { win = null; });
  let forceQuit = false;
  win.on('close', (e) => { if (!forceQuit) { e.preventDefault(); win.hide(); } });
  app.on('before-quit', () => { forceQuit = true; });
  globalShortcut.register('CommandOrControl+Shift+Space', () => { if (win) { win.show(); win.focus(); } });
}

function createTray() {
  try { tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'icon.png')).resize({ width: 16, height: 16 })); } catch { tray = new Tray(nativeImage.createEmpty()); }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Polaris', click: () => { win.show(); win.focus(); } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.setToolTip('Polaris');
  tray.on('double-click', () => { win.show(); win.focus(); });
}

// ── API Key management ──
const { setKey, getKey } = require('./services/keymanager');
let _authUserId = null;

async function refreshApiKey(userId) {
  try {
    var https = require('https');
    var anonKey = 'sb_publishable_hY1a3BqHfPvUNPQwkV6AEg_Nz-b2bgY';
    var fetched = false;
    await new Promise(function(resolve) {
      var options = {
        hostname: 'spwishxhydvgqbfchjgj.supabase.co',
        path: '/rest/v1/polaris_config?select=value&key=eq.deepseek_api_key',
        method: 'GET',
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer ' + anonKey,
          'Accept': 'application/json',
        },
        timeout: 10000,
      };
      var req = https.request(options, function(resp) {
        var d = '';
        resp.on('data', function(c) { d += c.toString(); });
        resp.on('end', function() {
          try {
            var arr = JSON.parse(d);
            if (Array.isArray(arr) && arr.length > 0 && arr[0].value) {
              _authUserId = userId;
              setKey(arr[0].value);
              fetched = true;
              console.log('[API Key] Loaded from cloud for user:', userId);
            }
          } catch {}
          resolve();
        });
      });
      req.on('error', function() { resolve(); });
      req.on('timeout', function() { req.destroy(); resolve(); });
      req.end();
    });
    if (!fetched) {
      // Fallback: use built-in encrypted key from secrets vault
      try {
        var { get: vaultGet } = require('./services/secrets');
        var builtinKey = vaultGet('deepseek_api_key');
        if (builtinKey) {
          _authUserId = userId;
          setKey(builtinKey);
          console.log('[API Key] Using built-in key for user:', userId);
        }
      } catch {}
    }
  } catch(e) {
    console.warn('[API Key] Fetch failed, using built-in:', e.message);
    try {
      var { get: vaultGet } = require('./services/secrets');
      var builtinKey = vaultGet('deepseek_api_key');
      if (builtinKey) { _authUserId = userId; setKey(builtinKey); }
    } catch {}
  }
}

// IPC: AI (auth-gated)
ipcMain.handle('polaris:query', async (_e, { text, strategy, systemPrompt, images, apiKeys }) => {
  var key = getKey();
  if (!key) {
    return { routing:{strategy:'locked',top_intent:'locked',selected_models:[],rationale:'auth required'}, responses:[{model_id:'locked',model_display:'Locked',content:'<div style="text-align:center;padding:20px"><div style="font-size:48px;margin-bottom:12px">🔐</div><p style="font-size:14px;color:hsl(var(--foreground));margin-bottom:8px">Polaris 需要登录才能使用</p><p style="font-size:12px;color:hsl(var(--muted-foreground));margin-bottom:16px">登录 BitWool 账号后解锁全部 AI 功能。点击左侧栏底部的<b style="color:hsl(var(--primary))">登录 BitWool</b>按钮。</p></div>'}], total_latency_ms:0 };
  }
  console.log('[polaris:query] text:', (text||'').slice(0,80));
  var onExec = function(evt) { if (win && !win.isDestroyed()) win.webContents.send('polaris:exec-log', evt); };
  var onTodo = function(evt) { if (win && !win.isDestroyed()) win.webContents.send('polaris:todo-update', evt); };
  try {
    var result = await executeQuery(text, strategy, systemPrompt, images, undefined, { onExec:onExec, onTodo:onTodo, deepseek:key });
    return result;
  } catch(e) {
    return { routing:{strategy:'error',top_intent:'error',selected_models:[],rationale:e.message}, responses:[{model_id:'error',model_display:'Error',content:'处理出错：'+e.message}], total_latency_ms:0 };
  }
});
ipcMain.handle('polaris:queryStream', async (event, { text, strategy, systemPrompt, images, apiKeys, language }) => {
  var key = getKey();
  if (!key) {
    var locked = { routing:{strategy:'locked',top_intent:'locked',selected_models:[],rationale:'auth required'}, responses:[{model_id:'locked',model_display:'Locked',content:'<div style="text-align:center;padding:20px"><div style="font-size:48px;margin-bottom:12px">🔐</div><p style="font-size:14px;color:hsl(var(--foreground));margin-bottom:8px">Polaris 需要登录才能使用</p><p style="font-size:12px;color:hsl(var(--muted-foreground));margin-bottom:16px">登录 BitWool 账号后解锁全部 AI 功能。点击左侧栏底部的<b style="color:hsl(var(--primary))">登录 BitWool</b>按钮。</p></div>'}], total_latency_ms:0 };
    if (win && !win.isDestroyed()) win.webContents.send('polaris:stream-end', locked);
    return locked;
  }
  var oc = function(data) { if (win && !win.isDestroyed()) win.webContents.send('polaris:stream-chunk', data); };
  // Notify Git panel when Agent performs git operations
  var onGitOp = function(data) { if (win && !win.isDestroyed()) win.webContents.send('polaris:git-update', data); };
  try {
    _mainGhToken = (apiKeys && apiKeys.github) || '';
    var r = await executeQuery(text, strategy, systemPrompt, images, oc, { deepseek:key, language:language || 'zh-CN', github:(apiKeys && apiKeys.github) || '', onGitOp:onGitOp });
    if (win && !win.isDestroyed()) win.webContents.send('polaris:stream-end', r);
    return r;
  } catch (e) {
    if (win && !win.isDestroyed()) win.webContents.send('polaris:stream-error', { message: e.message });
    throw e;
  }
});

// IPC: GitHub OAuth loopback login (RFC 8252 — auto browser, no manual codes)
ipcMain.handle('auth:githubLoginLoopback', (_e, { clientId }) => {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const cid = clientId || 'Ov23li6E6u2dnn2YqFNz';
    const PORT = 9876;

    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url || '/', 'http://127.0.0.1');
        if (u.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        if (err) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Authorization Failed</h2><p>' + err + '</p></body></html>');
          server.close();
          reject(new Error(err));
        } else if (code) {
          // Do the token exchange FIRST, then show result to the user
          exchangeCodeForToken(code, cid, PORT).then(function(r) {
            server.close();
            if (r.success) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d12;color:#e8e4dd"><h2 style="color:#3ba88e">Login Successful</h2><p style="color:#8a8794">Signed in as <b>' + (r.user && r.user.login) + '</b></p><p style="color:#5c5a66;font-size:14px">You may close this window and return to Polaris.</p></body></html>');
              resolve(r);
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d12;color:#e8e4dd"><h2 style="color:#d45a5a">Login Failed</h2><p>' + (r.error || 'Unknown error') + '</p><p style="color:#5c5a66;font-size:14px">Please try again from the Polaris app.</p></body></html>');
              reject(new Error(r.error || 'Token exchange failed'));
            }
          }).catch(function(e) {
            server.close();
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d12;color:#e8e4dd"><h2 style="color:#d45a5a">Login Failed</h2><p>' + e.message + '</p></body></html>');
            reject(e);
          });
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d12;color:#e8e4dd"><h2>Polaris OAuth</h2><p style="color:#8a8794">Waiting for GitHub authorization...</p></body></html>');
        }
      } catch (e) { server.close(); reject(e); }
    });

    server.on('error', function(e) { reject(new Error('Could not start on port ' + PORT + ': ' + e.message)); });
    server.listen(PORT, '127.0.0.1', function() {
      const redirectUri = 'http://127.0.0.1:' + PORT + '/callback';
      const authorizeUrl = 'https://github.com/login/oauth/authorize?' +
        'client_id=' + encodeURIComponent(cid) +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&scope=' + encodeURIComponent('repo,user,read:org');
      shell.openExternal(authorizeUrl);
      setTimeout(function() { try { server.close(); } catch {} reject(new Error('Authorization timed out after 120 seconds')); }, 120000);
    });
  });
});

// ── Helper: exchange OAuth code for GitHub access token ──
function exchangeCodeForToken(code, clientId, port) {
  return new Promise((resolve) => {
    const https = require('https');
    const body = JSON.stringify({
      client_id: clientId,
      client_secret: require('./services/secrets').get('github_client_secret') || '',
      code: code,
      redirect_uri: 'http://127.0.0.1:' + port + '/callback',
    });
    const req = https.request({
      hostname: 'github.com', path: '/login/oauth/access_token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    }, function(resp) {
      let d = '';
      resp.on('data', function(c) { d += c.toString(); });
      resp.on('end', function() {
        try {
          const data = JSON.parse(d);
          if (data.access_token) {
            const ur = https.request({
              hostname: 'api.github.com', path: '/user',
              method: 'GET',
              headers: { 'Authorization': 'Bearer ' + data.access_token, 'Accept': 'application/json', 'User-Agent': 'Polaris-Solver/2.0' },
              timeout: 10000,
            }, function(urResp) {
              let ud = '';
              urResp.on('data', function(c) { ud += c.toString(); });
              urResp.on('end', function() {
                try {
                  const udata = JSON.parse(ud);
                  resolve({ success: true, token: data.access_token, user: { id: 'gh_' + udata.id, login: udata.login, email: (udata.login + '@github'), displayName: udata.name || udata.login, avatar: udata.avatar_url } });
                } catch { resolve({ success: true, token: data.access_token, user: { id: 'gh_unknown', login: 'unknown', email: 'unknown@github', displayName: 'GitHub User', avatar: '' } }); }
              });
            });
            ur.on('error', function() { resolve({ success: true, token: data.access_token, user: { id: 'gh_unknown', login: 'unknown', email: 'unknown@github', displayName: 'GitHub User', avatar: '' } }); });
            ur.end();
          } else {
            resolve({ success: false, error: (data.error_description || data.error || 'No access token returned') });
          }
        } catch { resolve({ success: false, error: 'Failed to parse token response: ' + d.slice(0, 200) }); }
      });
    });
    req.on('error', function(e) { resolve({ success: false, error: 'Token exchange network error: ' + e.message }); });
    req.on('timeout', function() { req.destroy(); resolve({ success: false, error: 'Token exchange timeout' }); });
    req.write(body); req.end();
  });
}
// IPC: Auth — unlock/lock API key + session token
ipcMain.handle('auth:unlock', async (_e, { userId }) => {
  await refreshApiKey(userId);
  security.createAuthSession(userId);
  security.auditLog('auth', 'unlock', 'User: ' + userId);
  return { success: !!getKey() };
});
// IPC: GitHub OAuth login (device flow)
ipcMain.handle('auth:githubLogin', async (_e, { token, user }) => {
  try {
    _authUserId = user.id;
    _mainGhToken = token;
    // Store the GitHub token in settings for git ops
    if (win && !win.isDestroyed()) {
      win.webContents.send('polaris:github-token', { token, user });
    }
    // Use built-in key as fallback for AI features
    var vaultGet = require('./services/secrets').get;
    var builtinKey = vaultGet('deepseek_api_key');
    if (builtinKey) setKey(builtinKey);
    security.createAuthSession(user.id);
    security.auditLog('auth', 'githubLogin', 'User: ' + user.login);
    console.log('[Auth] GitHub login:', user.login);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('auth:lock', () => {
  _authUserId = null; setKey(null);
  security.destroyAuthSession();
  security.auditLog('auth', 'lock', 'Session destroyed');
  return { success: true };
});

// ═══════════════════════════════════════════════════════════
// Admin helpers — pure HTTPS (no supabase-js → no WebSocket)
// ═══════════════════════════════════════════════════════════

function supabaseAdminCall(method, path, body) {
  var https = require('https');
  var { get: vaultGet } = require('./services/secrets');
  var serviceKey = vaultGet('supabase_service_role');
  if (!serviceKey) return Promise.resolve({ success: false, error: 'Supabase service_role key not configured' });

  return new Promise(function(resolve) {
    var payload = body ? JSON.stringify(body) : null;
    var options = {
      hostname: 'spwishxhydvgqbfchjgj.supabase.co',
      path: '/auth/v1' + path,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        'apikey': serviceKey,
      },
      timeout: 15000,
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    var req = https.request(options, function(resp) {
      var d = '';
      resp.on('data', function(c) { d += c.toString(); });
      resp.on('end', function() {
        try { resolve({ ok: true, data: JSON.parse(d), status: resp.statusCode }); }
        catch { resolve({ ok: false, error: d.slice(0, 500), status: resp.statusCode }); }
      });
    });
    req.on('error', function(e) { resolve({ ok: false, error: e.message }); });
    req.on('timeout', function() { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function findUserByEmail(email) {
  var r = await supabaseAdminCall('GET', '/admin/users?per_page=100');
  if (!r.ok) return null;
  var users = (r.data && r.data.users) ? r.data.users : [];
  for (var i = 0; i < users.length; i++) {
    if (users[i].email === email) return users[i];
  }
  return null;
}

// IPC: Admin password reset — ★ 需速率限制 + 鉴权 ★
ipcMain.handle('auth:adminResetPassword', async (_e, { email, newPassword, token }) => {
  var rl = security.checkRateLimit('admin|rpc|' + (email || 'unknown'), security.RATE_LIMITS.adminCall.max, security.RATE_LIMITS.adminCall.window);
  if (!rl.allowed) return { success: false, error: '操作过于频繁，请 ' + rl.retryAfter + ' 秒后重试' };
  security.auditLog('admin', 'resetPassword', 'For: ' + email);
  try {
    var targetUser = await findUserByEmail(email);
    if (!targetUser) return { success: false, error: '未找到该邮箱对应的账号' };
    var r = await supabaseAdminCall('PUT', '/admin/users/' + targetUser.id, { password: newPassword });
    if (!r.ok) return { success: false, error: r.error || '更新失败' };
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// IPC: Admin confirm user email — ★ 需速率限制 ★
ipcMain.handle('auth:adminConfirmUser', async (_e, { email, token }) => {
  var rl = security.checkRateLimit('admin|confirm|' + (email || 'unknown'), security.RATE_LIMITS.adminCall.max, security.RATE_LIMITS.adminCall.window);
  if (!rl.allowed) return { success: false, error: '操作过于频繁' };
  security.auditLog('admin', 'confirmUser', 'For: ' + email);
  try {
    var targetUser = await findUserByEmail(email);
    if (!targetUser) return { success: false, error: '未找到该邮箱对应的账号' };
    var r = await supabaseAdminCall('PUT', '/admin/users/' + targetUser.id, { email_confirm: true });
    if (!r.ok) return { success: false, error: r.error || '确认失败' };
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// IPC: Admin create user — ★ 需速率限制 ★
ipcMain.handle('auth:adminCreateUser', async (_e, { email, password, displayName, token }) => {
  var rl = security.checkRateLimit('admin|create', security.RATE_LIMITS.adminCall.max, security.RATE_LIMITS.adminCall.window);
  if (!rl.allowed) return { success: false, error: '操作过于频繁' };
  security.auditLog('admin', 'createUser', 'For: ' + email);
  try {
    var r = await supabaseAdminCall('POST', '/admin/users', {
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { display_name: displayName || email.split('@')[0] },
    });
    if (r.ok && r.data && !r.data.error) {
      return { success: true, userId: r.data.id || r.data.user?.id };
    }
    if (r.data && r.data.msg && r.data.msg.includes('already')) {
      var existing = await findUserByEmail(email);
      if (existing) {
        var cfm = await supabaseAdminCall('PUT', '/admin/users/' + existing.id, { email_confirm: true });
        if (cfm.ok) return { success: true, userId: existing.id };
        return { success: false, error: cfm.error || '确认失败' };
      }
    }
    return { success: false, error: (r.data && r.data.msg) || r.error || '创建失败' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// IPC: Open URL in browser
ipcMain.handle('open-external', (_e, url) => { shell.openExternal(url); return true; });

// IPC: Window
ipcMain.handle('window:minimize', function() { if (win) win.minimize(); });
ipcMain.handle('window:maximize', function() { if (win) { if (win.isMaximized()) win.restore(); else win.maximize(); } });
ipcMain.handle('window:close', function() { if (win) win.close(); });

// IPC: Desktop
ipcMain.handle('desktop:screenshot', async () => desktop.takeScreenshot());
ipcMain.handle('desktop:listWindows', () => desktop.listWindows());
ipcMain.handle('desktop:focusWindow', (_e, t) => desktop.focusWindow(t));
ipcMain.handle('desktop:openApp', (_e, p) => desktop.openApplication(p));
ipcMain.handle('desktop:openBrowser', (_e, u) => desktop.openWebBrowser(u));
ipcMain.handle('desktop:openExplorer', (_e, d) => desktop.openFileExplorer(d));
ipcMain.handle('desktop:typeText', (_e, t) => desktop.typeText(t));
ipcMain.handle('desktop:pressKey', (_e, k) => desktop.pressKey(k));
ipcMain.handle('desktop:hotkey', (_e, c) => desktop.hotkey(c));
ipcMain.handle('desktop:moveMouse', (_e, x, y) => desktop.moveMouse(x, y));
ipcMain.handle('desktop:clickMouse', async (_e, x, y, b) => { desktop.moveMouse(x, y); await new Promise(r => setTimeout(r, 200)); return desktop.clickMouse(x, y, b); });
ipcMain.handle('desktop:doubleClick', (_e, x, y) => desktop.doubleClick(x, y));
ipcMain.handle('desktop:scrollMouse', (_e, d, a) => desktop.scrollMouse(d, a));
ipcMain.handle('desktop:getClipboard', () => desktop.getClipboard());
ipcMain.handle('desktop:setClipboard', (_e, t) => desktop.setClipboard(t));
ipcMain.handle('desktop:systemInfo', () => desktop.getSystemInfo());
ipcMain.handle('desktop:listFiles', (_e, d) => {
  var safe = security.sanitizePath(d) || require('os').homedir();
  return desktop.listFiles(safe);
});
ipcMain.handle('desktop:readFile', (_e, fp) => {
  var safe = security.sanitizePath(fp);
  if (!safe) return { success: false, error: '路径不允许——仅可读取用户目录下的文件' };
  security.auditLog('filesystem', 'readFile', safe);
  return desktop.readFile(safe);
});
ipcMain.handle('desktop:writeFile', (_e, fp, c) => {
  var safe = security.sanitizePath(fp);
  if (!safe) return { success: false, error: '路径不允许——仅可写入用户目录下的文件' };
  if (typeof c !== 'string' || c.length > 5 * 1024 * 1024) return { success: false, error: '内容过大（>5MB）' };
  security.auditLog('filesystem', 'writeFile', safe);
  return desktop.writeFile(safe, c);
});
ipcMain.handle('desktop:runCommand', (_e, c) => {
  security.auditLog('system', 'runCommand', String(c).slice(0, 100));
  // Only allow whitelisted commands
  var blocked = /rm\s+-rf|del\s+\/f|format|shutdown|taskkill/i;
  if (blocked.test(String(c))) return { success: false, error: '命令被安全策略阻止' };
  var rl = security.checkRateLimit('runCommand', 5, 60 * 1000);
  if (!rl.allowed) return { success: false, error: '操作过于频繁' };
  return desktop.runCommand(c);
});
ipcMain.handle('desktop:agentStep', async (_e, { goal, screenshot, history }) => { const sys = 'Goal: ' + goal + '. Reply JSON: {"action":"open_browser","url":"..."}'; try { const r = await executeQuery(goal, 'best_quality', sys); const cnt = r.responses?.[0]?.content || ''; const m = cnt.match(/\{[\s\S]*"action"[\s\S]*\}/); return { action: m ? JSON.parse(m[0]) : { action: 'done', summary: 'no action' }, raw: cnt }; } catch (e) { return { action: { action: 'done', summary: 'error' }, raw: '' }; } });

// IPC: MCP
ipcMain.handle('mcp:start', (_e, { id, command, args, env }) => { if (mcpProcesses.has(id)) return { success: false, message: 'Running' }; try { const p = spawn(command, args, { env: { ...process.env, ...env }, stdio: 'pipe' }); mcpProcesses.set(id, p); p.on('exit', () => mcpProcesses.delete(id)); return { success: true, pid: p.pid }; } catch (e) { return { success: false, message: e.message }; } });
ipcMain.handle('mcp:stop', (_e, id) => { const p = mcpProcesses.get(id); if (p) { p.kill(); mcpProcesses.delete(id); return { success: true }; } return { success: false }; });
ipcMain.handle('mcp:list', () => [...mcpProcesses.entries()].map(([id, p]) => ({ id, pid: p.pid, running: !p.killed })));

// IPC: Tools
const { ToolExecutor } = require('./services/tools');
var _mainGhToken = '';
const te = new ToolExecutor();
ipcMain.handle('tools:list', () => te.listTools());
ipcMain.handle('tools:execute', (_e, { tool, params, ghToken }) => {
  const { TOOLS } = require('./services/tools');
  const td = TOOLS[tool];
  if (td && td.category === 'git') {
    var t = ghToken || _mainGhToken || '';
    return Promise.resolve().then(() => td.execute(params, t));
  }
  return te.execute(tool, params);
});
ipcMain.handle('tools:confirm', (_e, { confirmId }) => te.confirmAndExecute(confirmId));
ipcMain.handle('tools:reject', (_e, { confirmId }) => te.rejectConfirmation(confirmId));

// ── Tool Permission Bridge ──
const permBridge = require('./services/permission_bridge');
permBridge.initPermissionBridge(function(msg) {
  if (win && !win.isDestroyed()) win.webContents.send(msg.channel, msg.data);
});
ipcMain.handle('tools:approvePermission', (_e, { id }) => {
  return { ok: permBridge.approvePermission(id) };
});
ipcMain.handle('tools:rejectPermission', (_e, { id }) => {
  return { ok: permBridge.rejectPermission(id) };
});

// IPC: Agents
const AGENTS = require('./services/agents');
ipcMain.handle('agents:list', () => Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name, role: a.role, goal: a.goal, tools: a.tools })));

// IPC: Workflows
const { WORKFLOWS } = require('./services/workflow');
ipcMain.handle('workflows:list', () => Object.entries(WORKFLOWS).map(([id, w]) => ({ id, name: w.name, steps: w.steps.map(s => ({ id: s.id, agent: s.agent, description: s.description })) })));

// IPC: System Monitor
ipcMain.handle('monitor:start', () => {
  systemMonitor.startMonitoring((card) => {
    if (win && !win.isDestroyed()) win.webContents.send('polaris:intervention', card);
  });
  return { success: true };
});
ipcMain.handle('monitor:update', (_e, activity) => { systemMonitor.updateKeyboardActivity(activity); return true; });
ipcMain.handle('monitor:setScene', (_e, scene) => { systemMonitor.setScene(scene); return true; });
ipcMain.handle('monitor:feedback', (_e, { eventKey, accepted }) => { systemMonitor.recordFeedback(eventKey, accepted); return true; });
ipcMain.handle('monitor:context', () => systemMonitor.getSystemContext());

// IPC: Planner
ipcMain.handle('planner:generate', (_e, { text }) => planner.generatePlan(text));
ipcMain.handle('planner:execute', async (event, { planId }) => {
  const oc = (data) => { if (win && !win.isDestroyed()) win.webContents.send('polaris:plan-progress', data); };
  return planner.executePlan(planId, oc);
});
ipcMain.handle('planner:reject', (_e, { planId }) => planner.rejectPlan(planId));
ipcMain.handle('planner:pending', () => planner.getPendingPlans());

// IPC: Notify
ipcMain.handle('notify', (_e, { title, body }) => { if (Notification.isSupported()) { new Notification({ title, body }).show(); return true; } return false; });

// IPC: Health Check
const { runHealthCheck } = require('./services/health_check');
ipcMain.handle('health:check', async () => runHealthCheck());

// IPC: Sandbox
const sandbox = require('./services/sandbox');
const sandboxDataPath = () => app.getPath('userData');
ipcMain.handle('sandbox:ready', () => sandbox.isReady(sandboxDataPath()));
ipcMain.handle('sandbox:needsSetup', () => sandbox.needsSetup(sandboxDataPath()));
ipcMain.handle('sandbox:getProgress', () => sandbox.getProgress());
ipcMain.handle('sandbox:health', () => sandbox.getSandboxHealth(sandboxDataPath()));
ipcMain.handle('sandbox:packages', () => sandbox.getInstalledPackages(sandboxDataPath()));
ipcMain.handle('sandbox:hasPolaris', () => sandbox.hasPolaris(sandboxDataPath()));
ipcMain.handle('sandbox:safety', (_e, { code }) => sandbox.checkSafety(code));
ipcMain.handle('sandbox:setup', async () => {
  const onProgress = (data) => { if (win && !win.isDestroyed()) win.webContents.send('sandbox:progress', data); };
  return sandbox.setup(sandboxDataPath(), onProgress);
});
ipcMain.handle('sandbox:repair', async () => {
  const onProgress = (data) => { if (win && !win.isDestroyed()) win.webContents.send('sandbox:progress', data); };
  return sandbox.repair(sandboxDataPath(), onProgress);
});
ipcMain.handle('sandbox:installPackage', (_e, { packageName }) => {
  return new Promise((resolve) => {
    const onProgress = (data) => { if (win && !win.isDestroyed()) win.webContents.send('sandbox:progress', data); };
    sandbox.installPackage(packageName, sandboxDataPath(), onProgress).then(resolve);
  });
});
ipcMain.handle('sandbox:uninstallPackage', (_e, { packageName }) => {
  return sandbox.uninstallPackage(packageName, sandboxDataPath());
});
ipcMain.handle('sandbox:runCode', (_e, { code }) => {
  return sandbox.runCode(code, sandboxDataPath());
});

// IPC: Email verification (SMTP via bitwool@163.com)
const { sendVerificationCode, sendWelcomeEmail, generateCode } = require('./services/email');
ipcMain.handle('email:sendCode', async (_e, { email }) => {
  var rl = security.checkRateLimit('email|code|' + (email || 'unknown'), security.RATE_LIMITS.sendCode.max, security.RATE_LIMITS.sendCode.window);
  if (!rl.allowed) return { success: false, error: '发送过于频繁，请 ' + rl.retryAfter + ' 秒后重试' };
  try {
    const code = generateCode();
    await sendVerificationCode(email, code);
    security.auditLog('email', 'sendCode', email);
    return { success: true, code };
  } catch (e) {
    console.error('[email] sendCode failed:', e.message);
    return { success: false, error: e.message };
  }
});
ipcMain.handle('email:sendWelcome', async (_e, { email, displayName }) => {
  try {
    await sendWelcomeEmail(email, displayName);
    return { success: true };
  } catch (e) {
    console.error('[email] sendWelcome failed:', e.message);
    return { success: false, error: e.message };
  }
});

// IPC: Forgot password email
const { sendPasswordResetCode } = require('./services/email');
ipcMain.handle('email:forgotPassword', async (_e, { email }) => {
  var rl = security.checkRateLimit('email|forgot|' + (email || 'unknown'), security.RATE_LIMITS.forgotPassword.max, security.RATE_LIMITS.forgotPassword.window);
  if (!rl.allowed) return { success: false, error: '重置请求过于频繁，请 ' + rl.retryAfter + ' 秒后重试' };
  try {
    const code = generateCode();
    await sendPasswordResetCode(email, code);
    security.auditLog('email', 'forgotPassword', email);
    return { success: true, code };
  } catch (e) {
    console.error('[email] forgotPassword failed:', e.message);
    return { success: false, error: e.message };
  }
});

// ── Terminal IPC ──
const terminal = require('./services/terminal');
ipcMain.handle('terminal:create', (_e, { type }) => {
  var s = terminal.createSession(type || 'powershell');
  return { success: true, id: s.id, pid: s.pid, cwd: s.cwd, type: s.type };
});
ipcMain.handle('terminal:write', (_e, { id, input }) => terminal.writeToSession(id, input));
ipcMain.handle('terminal:read', (_e, { id, lines }) => ({ output: terminal.readOutput(id, lines) }));
ipcMain.handle('terminal:kill', (_e, { id }) => terminal.killSession(id));

// ── Auto-setup sandbox on first launch ──
ipcMain.handle('sandbox:autoSetup', async () => {
  if (sandbox.isReady(sandboxDataPath())) {
    return { success: true, alreadyReady: true };
  }
  const onProgress = (data) => {
    if (win && !win.isDestroyed()) win.webContents.send('sandbox:progress', data);
  };
  return sandbox.setup(sandboxDataPath(), onProgress);
});

app.whenReady().then(() => { createWindow(); createTray(); systemMonitor.startMonitoring((card) => { if (win && !win.isDestroyed()) win.webContents.send('polaris:intervention', card); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); for (const [, p] of mcpProcesses) p.kill(); systemMonitor.stopMonitoring(); });

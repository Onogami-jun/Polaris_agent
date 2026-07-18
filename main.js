const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, globalShortcut, Notification } = require('electron');
const path = require('path');
const log = require('electron-log');
const { executeQuery } = require('./router');
const desktop = require('./desktop');
const { spawn } = require('child_process');

log.transports.file.level = 'info';
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let win = null, tray = null;
const mcpProcesses = new Map();

function createWindow() {
  win = new BrowserWindow({ width: 1100, height: 750, minWidth: 720, minHeight: 500, center: true, title: 'Polaris', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 14 }, backgroundColor: '#0b0e14', frame: false, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') } });
  win.loadURL(isDev ? 'http://localhost:3000' : 'file://' + path.join(__dirname, 'build', 'index.html'));
  win.once('ready-to-show', () => { win.show(); win.center(); });
  win.on('closed', () => { win = null; });
  let forceQuit = false;
  win.on('close', (e) => { if (!forceQuit) { e.preventDefault(); win.hide(); } });
  app.on('before-quit', () => { forceQuit = true; });
  // Global shortcut
  globalShortcut.register('CommandOrControl+Shift+Space', () => { if (win) { win.show(); win.focus(); } });
}

function createTray() {
  try { tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 })); } catch { tray = new Tray(nativeImage.createEmpty()); }
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Show Polaris', click: () => { win.show(); win.focus(); } }, { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }]));
  tray.setToolTip('Polaris Agent');
  tray.on('double-click', () => { win.show(); win.focus(); });
}

// ── IPC: AI Query ──
ipcMain.handle('polaris:query', async (_e, { text, strategy, systemPrompt, images }) => {
  return executeQuery(text, strategy, systemPrompt, images);
});

// ── IPC: Streaming Query ──
ipcMain.handle('polaris:queryStream', async (event, { text, strategy, systemPrompt, images }) => {
  const onChunk = (data) => {
    if (win && !win.isDestroyed()) win.webContents.send('polaris:stream-chunk', data);
  };
  try {
    const result = await executeQuery(text, strategy, systemPrompt, images, onChunk);
    if (win && !win.isDestroyed()) win.webContents.send('polaris:stream-end', result);
    return result;
  } catch (e) {
    if (win && !win.isDestroyed()) win.webContents.send('polaris:stream-error', { message: e.message });
    throw e;
  }
});

// ── IPC: Window ──
ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:maximize', () => { if (win?.isMaximized()) win.restore(); else win?.maximize(); });
ipcMain.handle('window:close', () => win?.close());

// ── IPC: Desktop Automation ──
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
ipcMain.handle('desktop:clickMouse', (_e, x, y, b) => { desktop.moveMouse(x, y); setTimeout(() => desktop.clickMouse(x, y, b), 200); return { success: true }; });
ipcMain.handle('desktop:doubleClick', (_e, x, y) => desktop.doubleClick(x, y));
ipcMain.handle('desktop:scrollMouse', (_e, d, a) => desktop.scrollMouse(d, a));
ipcMain.handle('desktop:getClipboard', () => desktop.getClipboard());
ipcMain.handle('desktop:setClipboard', (_e, t) => desktop.setClipboard(t));
ipcMain.handle('desktop:systemInfo', () => desktop.getSystemInfo());
ipcMain.handle('desktop:listFiles', (_e, d) => desktop.listFiles(d));
ipcMain.handle('desktop:readFile', (_e, fp) => desktop.readFile(fp));
ipcMain.handle('desktop:writeFile', (_e, fp, c) => desktop.writeFile(fp, c));
ipcMain.handle('desktop:runCommand', (_e, c) => desktop.runCommand(c));
ipcMain.handle('desktop:agentStep', async (_e, { goal, screenshot, history }) => {
  const sys = `You control a Windows desktop. Goal: ${goal}. Reply with JSON: {"action":"open_browser","url":"..."} or {"action":"click","x":500,"y":300} or {"action":"type","text":"..."} or {"action":"done","summary":"..."}`;
  try {
    const r = await executeQuery(goal, 'best_quality', sys);
    const c = r.responses?.[0]?.content || '';
    const m = c.match(/\{[\s\S]*"action"[\s\S]*\}/);
    return { action: m ? JSON.parse(m[0]) : { action: 'done', summary: 'no action' }, raw: c };
  } catch (e) { return { action: { action: 'done', summary: 'error' }, raw: '' }; }
});

// ── IPC: MCP ──
ipcMain.handle('mcp:start', (_e, { id, command, args, env }) => {
  if (mcpProcesses.has(id)) return { success: false, message: 'Already running' };
  try {
    const proc = spawn(command, args, { env: { ...process.env, ...env }, stdio: 'pipe' });
    mcpProcesses.set(id, proc);
    proc.on('exit', () => mcpProcesses.delete(id));
    return { success: true, pid: proc.pid };
  } catch (e) { return { success: false, message: e.message }; }
});
ipcMain.handle('mcp:stop', (_e, id) => {
  const p = mcpProcesses.get(id);
  if (p) { p.kill(); mcpProcesses.delete(id); return { success: true }; }
  return { success: false };
});
ipcMain.handle('mcp:list', () => [...mcpProcesses.entries()].map(([id, p]) => ({ id, pid: p.pid, running: !p.killed })));

// ── IPC: Notification ──
ipcMain.handle('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) { new Notification({ title, body }).show(); return true; }
  return false;
});

app.whenReady().then(() => { createWindow(); createTray(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); for (const [_, p] of mcpProcesses) p.kill(); });

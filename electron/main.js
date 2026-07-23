const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, globalShortcut, Notification } = require('electron');
const path = require('path');
const log = require('electron-log');
const { executeQuery } = require('./services/router');
const desktop = require('./services/desktop');
const { spawn } = require('child_process');

log.transports.file.level = 'info';
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const ROOT = path.join(__dirname, '..');

let win = null, tray = null;
const mcpProcesses = new Map();

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 750, minWidth: 720, minHeight: 500, center: true,
    title: 'Polaris', titleBarStyle: 'hiddenInset',
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

// IPC: AI
ipcMain.handle('polaris:query', async (_e, { text, strategy, systemPrompt, images, apiKeys }) => executeQuery(text, strategy, systemPrompt, images, undefined, apiKeys || {}));
ipcMain.handle('polaris:queryStream', async (event, { text, strategy, systemPrompt, images, apiKeys }) => {
  const oc = (data) => { if (win && !win.isDestroyed()) win.webContents.send('polaris:stream-chunk', data); };
  try { const r = await executeQuery(text, strategy, systemPrompt, images, oc, apiKeys || {}); if (win && !win.isDestroyed()) win.webContents.send('polaris:stream-end', r); return r; }
  catch (e) { if (win && !win.isDestroyed()) win.webContents.send('polaris:stream-error', { message: e.message }); throw e; }
});

// IPC: Window
ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:maximize', () => { if (win?.isMaximized()) win.restore(); else win?.maximize(); });
ipcMain.handle('window:close', () => win?.close());

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
ipcMain.handle('desktop:agentStep', async (_e, { goal, screenshot, history }) => { const sys = 'Goal: ' + goal + '. Reply JSON: {"action":"open_browser","url":"..."}'; try { const r = await executeQuery(goal, 'best_quality', sys); const cnt = r.responses?.[0]?.content || ''; const m = cnt.match(/\{[\s\S]*"action"[\s\S]*\}/); return { action: m ? JSON.parse(m[0]) : { action: 'done', summary: 'no action' }, raw: cnt }; } catch (e) { return { action: { action: 'done', summary: 'error' }, raw: '' }; } });

// IPC: MCP
ipcMain.handle('mcp:start', (_e, { id, command, args, env }) => { if (mcpProcesses.has(id)) return { success: false, message: 'Running' }; try { const p = spawn(command, args, { env: { ...process.env, ...env }, stdio: 'pipe' }); mcpProcesses.set(id, p); p.on('exit', () => mcpProcesses.delete(id)); return { success: true, pid: p.pid }; } catch (e) { return { success: false, message: e.message }; } });
ipcMain.handle('mcp:stop', (_e, id) => { const p = mcpProcesses.get(id); if (p) { p.kill(); mcpProcesses.delete(id); return { success: true }; } return { success: false }; });
ipcMain.handle('mcp:list', () => [...mcpProcesses.entries()].map(([id, p]) => ({ id, pid: p.pid, running: !p.killed })));

// IPC: Tools
const { ToolExecutor } = require('./services/tools');
const te = new ToolExecutor();
ipcMain.handle('tools:list', () => te.listTools());
ipcMain.handle('tools:execute', (_e, { tool, params }) => te.execute(tool, params));
ipcMain.handle('tools:confirm', (_e, { confirmId }) => te.confirmAndExecute(confirmId));
ipcMain.handle('tools:reject', (_e, { confirmId }) => te.rejectConfirmation(confirmId));

// IPC: Agents
const AGENTS = require('./services/agents');
ipcMain.handle('agents:list', () => Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name, role: a.role, goal: a.goal, tools: a.tools })));

// IPC: Workflows
const { WORKFLOWS } = require('./services/workflow');
ipcMain.handle('workflows:list', () => Object.entries(WORKFLOWS).map(([id, w]) => ({ id, name: w.name, steps: w.steps.map(s => ({ id: s.id, agent: s.agent, description: s.description })) })));

// IPC: Notify
ipcMain.handle('notify', (_e, { title, body }) => { if (Notification.isSupported()) { new Notification({ title, body }).show(); return true; } return false; });

app.whenReady().then(() => { createWindow(); createTray(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); for (const [, p] of mcpProcesses) p.kill(); });

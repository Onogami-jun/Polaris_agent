const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } = require('electron');
const path = require('path');
const log = require('electron-log');
const { executeQuery } = require('./router');
const desktop = require('./desktop');

log.transports.file.level = 'info';
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 750, minWidth: 720, minHeight: 500, center: true,
    title: 'Polaris', titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 }, backgroundColor: '#0b0e14',
    frame: false, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  const startURL = isDev ? 'http://localhost:3000' : 'file://' + path.join(__dirname, 'build', 'index.html');
  win.loadURL(startURL);
  win.once('ready-to-show', () => { win.show(); win.center(); });
  win.on('closed', () => { win = null; });
  let forceQuit = false;
  win.on('close', (e) => { if (!forceQuit) { e.preventDefault(); win.hide(); } });
  app.on('before-quit', () => { forceQuit = true; });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  let trayIcon;
  try { trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }); } catch { trayIcon = nativeImage.createEmpty(); }
  tray = new Tray(trayIcon);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Polaris', click: () => { win.show(); win.focus(); } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.setToolTip('Polaris Agent');
  tray.on('double-click', () => { win.show(); win.focus(); });
}

// ── IPC: AI Query ────────────────────────────────────────────

ipcMain.handle('polaris:query', async (_event, { text, strategy, systemPrompt, images }) => {
  return executeQuery(text, strategy, systemPrompt, images);
});

// ── IPC: Window Controls ─────────────────────────────────────

ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:maximize', () => { if (win?.isMaximized()) win.restore(); else win?.maximize(); });
ipcMain.handle('window:close', () => win?.close());

// ── IPC: Desktop Automation ──────────────────────────────────

ipcMain.handle('desktop:screenshot', async () => desktop.takeScreenshot());
ipcMain.handle('desktop:listWindows', () => desktop.listWindows());
ipcMain.handle('desktop:focusWindow', (_e, title) => desktop.focusWindow(title));
ipcMain.handle('desktop:openApp', (_e, appPath) => desktop.openApplication(appPath));
ipcMain.handle('desktop:openBrowser', (_e, url) => desktop.openWebBrowser(url));
ipcMain.handle('desktop:openExplorer', (_e, dir) => desktop.openFileExplorer(dir));
ipcMain.handle('desktop:typeText', (_e, text) => desktop.typeText(text));
ipcMain.handle('desktop:pressKey', (_e, key) => desktop.pressKey(key));
ipcMain.handle('desktop:hotkey', (_e, combo) => desktop.hotkey(combo));
ipcMain.handle('desktop:moveMouse', (_e, x, y) => desktop.moveMouse(x, y));
ipcMain.handle('desktop:clickMouse', (_e, x, y, btn) => { desktop.moveMouse(x, y); setTimeout(() => desktop.clickMouse(x, y, btn), 200); return { success: true }; });
ipcMain.handle('desktop:doubleClick', (_e, x, y) => desktop.doubleClick(x, y));
ipcMain.handle('desktop:scrollMouse', (_e, dir, amt) => desktop.scrollMouse(dir, amt));
ipcMain.handle('desktop:getClipboard', () => desktop.getClipboard());
ipcMain.handle('desktop:setClipboard', (_e, text) => desktop.setClipboard(text));
ipcMain.handle('desktop:systemInfo', () => desktop.getSystemInfo());
ipcMain.handle('desktop:listFiles', (_e, dir) => desktop.listFiles(dir));
ipcMain.handle('desktop:readFile', (_e, fp) => desktop.readFile(fp));
ipcMain.handle('desktop:writeFile', (_e, fp, content) => desktop.writeFile(fp, content));
ipcMain.handle('desktop:runCommand', (_e, cmd) => desktop.runCommand(cmd));

// ── IPC: Agent ReAct Loop ───────────────────────────────────

ipcMain.handle('desktop:agentStep', async (_event, { goal, screenshot, history }) => {
  // Build a system prompt that describes the screen and asks for the next action
  const systemPrompt = `You are Polaris, a desktop automation agent. You control the user's Windows computer.

You have access to these desktop actions:
- open_app: Open an application by name/path
- open_browser: Open a URL in the default browser
- open_explorer: Open a folder in File Explorer
- focus_window: Switch to a window by title
- type: Type text at the current cursor position
- press_key: Press a single key (enter, tab, esc, backspace, delete, up, down, left, right, space)
- hotkey: Press a key combo (ctrl+c, alt+f4, win+r, etc.)
- move_mouse: Move cursor to x,y coordinates
- click: Click at x,y (button: left/right)
- double_click: Double-click at x,y
- scroll: Scroll (up/down) by amount
- read_clipboard: Get clipboard text
- write_clipboard: Set clipboard text
- list_files: List files in a directory
- read_file: Read a file's contents
- write_file: Write content to a file
- run_command: Run a shell command
- wait: Wait for N milliseconds
- done: Task complete

Goal: ${goal}

Previous actions: ${history || 'none'}

Reply ONLY with a JSON action object. Examples:
{"action":"open_browser","url":"https://google.com","reason":"Opening browser to search"}
{"action":"type","text":"hello world","reason":"Typing message"}
{"action":"click","x":500,"y":300,"button":"left","reason":"Clicking button"}
{"action":"run_command","command":"dir C:\\","reason":"Listing C drive"}
{"action":"done","summary":"Task completed"}`;

  const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: 'Take the next action to achieve the goal.' }];
  try {
    const result = await executeQuery(goal, 'best_quality', systemPrompt);
    const content = result.responses?.[0]?.content || '';
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*"action"[\s\S]*\}/);
    if (jsonMatch) {
      const action = JSON.parse(jsonMatch[0]);
      return { action, raw: content };
    }
    return { action: { action: 'done', summary: 'No parseable action found' }, raw: content };
  } catch (e) {
    return { action: { action: 'done', summary: 'Error: ' + e.message }, raw: '' };
  }
});

app.whenReady().then(() => { createWindow(); createTray(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

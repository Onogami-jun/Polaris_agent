const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const log = require('electron-log');
const { executeQuery } = require('./router');

log.transports.file.level = 'info';
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 750,
    minWidth: 720, minHeight: 500,
    center: true,
    title: 'Polaris',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#0b0e14',
    frame: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const startURL = isDev ? 'http://localhost:3000' : 'file://' + path.join(__dirname, 'build', 'index.html');
  win.loadURL(startURL);
  win.once('ready-to-show', () => { win.show(); win.center(); });
  win.on('closed', () => { win = null; });

  // Minimize to tray on close
  let forceQuit = false;
  win.on('close', (e) => { if (!forceQuit) { e.preventDefault(); win.hide(); } });
  app.on('before-quit', () => { forceQuit = true; });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  let trayIcon;
  try { trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }); }
  catch { trayIcon = nativeImage.createEmpty(); }
  tray = new Tray(trayIcon);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Polaris', click: () => { win.show(); win.focus(); } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.setToolTip('Polaris Agent');
  tray.on('double-click', () => { win.show(); win.focus(); });
}

// ── IPC: Embedded Router ────────────────────────────────────

ipcMain.handle('polaris:query', async (_event, { text, strategy, systemPrompt }) => {
  return executeQuery(text, strategy, systemPrompt);
});

ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:maximize', () => {
  if (win?.isMaximized()) win.restore();
  else win?.maximize();
});
ipcMain.handle('window:close', () => win?.close());

app.whenReady().then(() => { createWindow(); createTray(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

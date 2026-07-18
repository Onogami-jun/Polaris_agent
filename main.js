const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

log.transports.file.level = 'info';
autoUpdater.logger = log;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 750, minWidth: 720, minHeight: 500, center: true,
    title: 'Polaris Agent',
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

  win.once('ready-to-show', () => { win.show(); win.center(); if (isDev) win.webContents.openDevTools({ mode: 'detach' }); });
  win.on('closed', () => { win = null; });

  // Minimize to tray
  let forceQuit = false;
  win.on('close', (e) => { if (!forceQuit) { e.preventDefault(); win.hide(); } });
  app.on('before-quit', () => { forceQuit = true; });

  setupIPC();
  setupAutoUpdater();
}

function createTray() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  let trayIcon;
  try { trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }); } catch { trayIcon = nativeImage.createEmpty(); }
  tray = new Tray(trayIcon);
  const ctx = Menu.buildFromTemplate([
    { label: '显示 Polaris', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: '官方网站', click: () => shell.openExternal('https://bitwool.cn') },
    { label: '检查更新', click: () => { autoUpdater.checkForUpdatesAndNotify(); } },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setToolTip('Polaris Agent');
  tray.setContextMenu(ctx);
  tray.on('double-click', () => { win.show(); win.focus(); });
}

function setupIPC() {
  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
}

function setupAutoUpdater() {
  autoUpdater.checkForUpdatesAndNotify();
  autoUpdater.on('update-available', () => win?.webContents.send('update-available'));
  autoUpdater.on('update-downloaded', () => win?.webContents.send('update-downloaded'));
}

app.whenReady().then(() => { createWindow(); createTray(); app.on('activate', () => { if (!win) createWindow(); else { win.show(); win.focus(); } }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

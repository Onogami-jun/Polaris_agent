/**
 * Polaris Desktop Automation Engine v0.1
 * Screenshots + window control + keyboard/mouse + ReAct loop.
 * Uses PowerShell/Win32 APIs through child_process — no native deps.
 */
const { execSync, exec } = require('child_process');
const { desktopCapturer, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* ── Safe PowerShell escaping ── */
function safePS(s) {
  // Escape single quotes by doubling them (PowerShell convention)
  return String(s).replace(/'/g, "''").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function safePSNum(n) {
  const num = parseInt(String(n), 10);
  if (isNaN(num)) return '0';
  return String(Math.min(Math.max(num, -30000), 30000)); // clamp coordinates
}

// ── Screenshot ──────────────────────────────────────────────

/* 读取主显示器物理分辨率 + DPI 缩放（用于坐标换算） */
function getScreenMetrics() {
  try {
    const d = screen.getPrimaryDisplay();
    return {
      width: d.size.width,
      height: d.size.height,
      scaleFactor: d.scaleFactor || 1,
      workArea: d.workArea ? { x: d.workArea.x, y: d.workArea.y, width: d.workArea.width, height: d.workArea.height } : null,
    };
  } catch {
    return { width: 1920, height: 1080, scaleFactor: 1, workArea: null };
  }
}

async function takeScreenshot() {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
  if (sources.length === 0) return null;
  const img = sources[0].thumbnail;
  const buf = img.toPNG();
  const base64 = buf.toString('base64');
  return 'data:image/png;base64,' + base64;
}

/* 带尺寸信息的截图：等比缩放到最大宽 1920（豆包图像大小限制），
 * 返回实际截图尺寸 + 物理分辨率，供坐标换算（图内坐标 → 物理坐标）。 */
async function takeScreenshotDetailed() {
  const metrics = getScreenMetrics();
  var targetW = metrics.width;
  var targetH = metrics.height;
  var maxW = 1920;
  if (targetW > maxW) {
    var ratio = maxW / targetW;
    targetW = maxW;
    targetH = Math.round(targetH * ratio);
  }
  if (targetH < 1) targetH = 1;
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: targetW, height: targetH } });
  if (sources.length === 0) return null;
  const img = sources[0].thumbnail;
  const size = img.getSize();
  const buf = img.toPNG();
  return {
    dataUrl: 'data:image/png;base64,' + buf.toString('base64'),
    width: size.width,
    height: size.height,
    physicalWidth: metrics.width,
    physicalHeight: metrics.height,
    scaleFactor: metrics.scaleFactor,
  };
}

// ── Window Management ───────────────────────────────────────

function listWindows() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne \\\"\\\"} | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json"',
      { timeout: 5000, encoding: 'utf8' }
    );
    return JSON.parse(out);
  } catch { return []; }
}

function focusWindow(title) {
  try {
    const escaped = title.replace(/"/g, '\\"');
    execSync(`powershell -NoProfile -Command "$wshell=New-Object -ComObject wscript.shell;$wshell.AppActivate('${escaped}')"`, { timeout: 3000 });
    return { success: true, message: 'Focused: ' + title };
  } catch (e) { return { success: false, message: e.message }; }
}

function openApplication(appPath) {
  try {
    execSync(`start "" "${appPath}"`, { timeout: 5000 });
    return { success: true, message: 'Opened: ' + appPath };
  } catch (e) { return { success: false, message: e.message }; }
}

function openWebBrowser(url) {
  try {
    execSync(`start "" "${url}"`, { timeout: 5000 });
    return { success: true, message: 'Opened browser: ' + url };
  } catch (e) { return { success: false, message: e.message }; }
}

function openFileExplorer(dirPath) {
  try {
    execSync(`explorer "${dirPath}"`, { timeout: 5000 });
    return { success: true, message: 'Opened: ' + dirPath };
  } catch (e) { return { success: false, message: e.message }; }
}

// ── Keyboard ────────────────────────────────────────────────

function sendKeys(keys) {
  const vbsPath = path.join(os.tmpdir(), 'polaris_keys.vbs');
  const vbs = `Set WshShell = WScript.CreateObject("WScript.Shell")\nWshShell.SendKeys "${keys}"\n`;
  try {
    fs.writeFileSync(vbsPath, vbs);
    execSync(`cscript //B //NoLogo "${vbsPath}"`, { timeout: 3000 });
    fs.unlinkSync(vbsPath);
    return { success: true, message: 'Typed: ' + keys };
  } catch (e) { return { success: false, message: e.message }; }
}

function typeText(text) {
  const escaped = text.replace(/([{}+^%~()])/g, '{$1}').replace(/\n/g, '{ENTER}');
  return sendKeys(escaped);
}

function pressKey(key) {
  const map = { enter: '{ENTER}', tab: '{TAB}', esc: '{ESC}', backspace: '{BACKSPACE}', delete: '{DELETE}', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}', space: ' ', ctrl: '^', alt: '%' };
  return sendKeys(map[key] || '{' + key.toUpperCase() + '}');
}

function hotkey(combo) {
  // combo like "ctrl+c", "alt+f4"
  let k = combo.toLowerCase();
  k = k.replace('ctrl+', '^').replace('alt+', '%').replace('shift+', '+').replace('win+', '#');
  return sendKeys(k);
}

// ── Mouse ───────────────────────────────────────────────────

function moveMouse(x, y) {
  try {
    execSync(`powershell -NoProfile -Command "[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${safePSNum(x)},${safePSNum(y)})"`, { timeout: 3000 });
    return { success: true, message: `Mouse → ${x},${y}` };
  } catch (e) { return { success: false, message: e.message }; }
}

function clickMouse(x, y, button) {
  const b = button || 'left';
  try {
    if (x !== undefined && y !== undefined) moveMouse(x, y);
    const vbsPath = path.join(os.tmpdir(), 'polaris_click.vbs');
    const btnMap = { left: 1, right: 2, middle: 4 };
    const vbs = `Set objShell = CreateObject("WScript.Shell")\nobjShell.SendKeys "{F13}"\n`;
    fs.writeFileSync(vbsPath, vbs);
    // Use mouse_event via powershell for actual clicking
    const sx = safePSNum(x), sy = safePSNum(y);
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${sx},${sy}); Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name Win32 -Namespace System; $down = ${b === 'left' ? '0x0002' : b === 'right' ? '0x0008' : '0x0020'}; $up = ${b === 'left' ? '0x0004' : b === 'right' ? '0x0010' : '0x0040'}; [System.Win32]::mouse_event($down, 0, 0, 0, 0); Start-Sleep -Milliseconds 80; [System.Win32]::mouse_event($up, 0, 0, 0, 0)`;
    execSync(`powershell -NoProfile -Command "${psScript}"`, { timeout: 3000 });
    return { success: true, message: `Clicked ${b} at ${x},${y}` };
  } catch (e) { return { success: false, message: e.message }; }
}

function doubleClick(x, y) {
  clickMouse(x, y, 'left');
  setTimeout(() => clickMouse(x, y, 'left'), 100);
  return { success: true, message: `Double-clicked at ${x},${y}` };
}

function scrollMouse(direction, amount) {
  const dir = direction === 'up' ? 120 : -120;
  const amt = amount || 3;
  try {
    for (let i = 0; i < amt; i++) {
      execSync(`powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name W32 -Namespace Sys; [Sys.W32]::mouse_event(0x0800, 0, 0, ${dir}, 0)"`, { timeout: 2000 });
    }
    return { success: true, message: `Scrolled ${direction} x${amt}` };
  } catch (e) { return { success: false, message: e.message }; }
}

// ── Clipboard ───────────────────────────────────────────────

function getClipboard() {
  try { return execSync('powershell -NoProfile -Command "Get-Clipboard"', { timeout: 3000, encoding: 'utf8' }).trim(); } catch { return ''; }
}

function setClipboard(text) {
  try { execSync(`powershell -NoProfile -Command "Set-Clipboard -Value '${safePS(text)}'"`, { timeout: 3000 }); return true; } catch { return false; }
}

// ── System Info ─────────────────────────────────────────────

function getSystemInfo() {
  try {
    const os = require('os');
    return {
      platform: process.platform, arch: os.arch(), cpus: os.cpus().length,
      totalMem: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
      hostname: os.hostname(), homedir: os.homedir(),
    };
  } catch { return { platform: process.platform }; }
}

// ── File Operations ─────────────────────────────────────────

function listFiles(dirPath) {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    return items.map(i => ({ name: i.name, type: i.isDirectory() ? 'dir' : 'file', size: i.isFile() ? fs.statSync(path.join(dirPath, i.name)).size : 0 }));
  } catch (e) { return []; }
}

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8').slice(0, 5000); } catch (e) { return null; }
}

function writeFile(filePath, content) {
  try { fs.writeFileSync(filePath, content); return { success: true }; } catch (e) { return { success: false, message: e.message }; }
}

function runCommand(command) {
  try {
    const out = execSync(command, { timeout: 15000, encoding: 'utf8' });
    return out.slice(0, 3000);
  } catch (e) { return e.message || 'Command failed'; }
}

module.exports = {
  takeScreenshot, takeScreenshotDetailed, getScreenMetrics,
  listWindows, focusWindow, openApplication, openWebBrowser, openFileExplorer,
  sendKeys, typeText, pressKey, hotkey,
  moveMouse, clickMouse, doubleClick, scrollMouse,
  getClipboard, setClipboard, getSystemInfo,
  listFiles, readFile, writeFile, runCommand,
};

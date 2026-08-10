/**
 * Polaris Terminal Service v1.0
 * Spawns PowerShell or CMD shells, streams output to renderer.
 */
const { spawn } = require('child_process');
const os = require('os');

const sessions = new Map();

function createSession(type) {
  const isWin = os.platform() === 'win32';
  const shell = type === 'powershell'
    ? { cmd: 'powershell.exe', args: ['-NoLogo', '-NoExit', '-Command', '-'] }
    : { cmd: 'cmd.exe', args: [] };
  const id = 'term_' + Date.now();
  const child = spawn(shell.cmd, shell.args, {
    cwd: os.homedir(),
    env: Object.assign({}, process.env, { TERM: 'xterm-256color', COLORTERM: 'truecolor' }),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const session = { id, type, child, cwd: os.homedir(), output: '', pid: child.pid };
  child.stdout.on('data', function(c) { session.output += c.toString().slice(0, 50000); });
  child.stderr.on('data', function(c) { session.output += c.toString().slice(0, 50000); });
  child.on('exit', function() { session.alive = false; });
  session.alive = true;
  sessions.set(id, session);
  return session;
}

function getSession(id) { return sessions.get(id); }
function writeToSession(id, input) {
  var s = sessions.get(id);
  if (!s || !s.alive) return { success: false, error: 'Session not found or terminated' };
  s.child.stdin.write(input + '\r\n');
  return { success: true };
}
function readOutput(id, lines) {
  var s = sessions.get(id);
  if (!s) return '';
  var out = s.output;
  if (lines) { var all = out.split('\n'); return all.slice(-lines).join('\n'); }
  return out;
}
function killSession(id) {
  var s = sessions.get(id);
  if (!s) return { success: false };
  try { s.child.kill(); } catch {}
  sessions.delete(id);
  return { success: true };
}

module.exports = { createSession, getSession, writeToSession, readOutput, killSession };

/**
 * Polaris Structured Logger v1.0
 * JSON-structured logs with trace IDs, levels, and context.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.polaris', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'agent.log');
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let _level = 'info';
let _traceId = '';
let _buffer = [];

// Init
function ensureDir() {
  try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); }
  catch {}
}

function newTraceId() {
  _traceId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return _traceId;
}

// Core
function log(level, message, context = {}) {
  if (LEVELS[level] < LEVELS[_level]) return;

  const entry = {
    ts: new Date().toISOString(),
    tid: _traceId || 'no-trace',
    lvl: level,
    msg: message,
    ctx: Object.keys(context).length ? context : undefined,
  };

  // In-memory buffer for the frontend
  _buffer.push(entry);
  if (_buffer.length > 200) _buffer.shift();

  // Console output
  const ctxStr = context && Object.keys(context).length ? ' ' + JSON.stringify(context) : '';
  const prefix = `[${entry.ts.slice(11, 19)}] [${level.toUpperCase()}]`;
  if (level === 'error') console.error(prefix, message, ctxStr);
  else if (level === 'warn') console.warn(prefix, message, ctxStr);
  else console.log(prefix, message, ctxStr);

  // File persistence (async, fire-and-forget)
  try {
    ensureDir();
    fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', () => {});
  } catch {}
}

// Public API
function debug(msg, ctx) { log('debug', msg, ctx); }
function info(msg, ctx) { log('info', msg, ctx); }
function warn(msg, ctx) { log('warn', msg, ctx); }
function error(msg, ctx) { log('error', msg, ctx); }
function setLevel(level) { _level = level; }
function getTraceId() { return _traceId; }
function getRecent(count = 50) { return _buffer.slice(-count); }
function getLogPath() { return LOG_FILE; }

module.exports = { debug, info, warn, error, setLevel, newTraceId, getTraceId, getRecent, getLogPath };

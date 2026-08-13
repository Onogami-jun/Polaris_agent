/**
 * Polaris Permission Bridge — Claude Code-style tool permission requests
 *
 * How it works:
 *   1. router.js calls requestPermission() when a tool needs user confirmation
 *   2. This module sends a notification to the renderer via the sender callback
 *   3. The renderer shows a permission dialog to the user
 *   4. User clicks approve/reject → renderer calls IPC → main.js resolves the Promise
 *   5. router.js continues with the confirmed tool execution
 */

let _sender = null;  // set by main.js: function(data) { win.webContents.send(...) }
let _seq = 0;
const _pending = new Map();

/* ── Session-scoped approval whitelist ──
 * When user clicks "始终允许", the tool + path prefix is remembered.
 * Subsequent requests for the same path (or sub-paths) auto-approve. */
const _approvedPrefixes = [];

function _extractPath(params) {
  if (!params) return '';
  return String(params.path || params.dir || params.filepath || '');
}

function _isApproved(tool, params) {
  const p = _extractPath(params);
  if (!p) return false;
  // Check if p is under (or equal to) any approved prefix for the same tool category
  for (const a of _approvedPrefixes) {
    if (a.tool === tool && p.toLowerCase().startsWith(a.path.toLowerCase())) return true;
    // Cross-tool filesystem approval: read_file/list_dir/write_file share paths
    const fsTools = ['read_file', 'list_dir', 'write_file'];
    if (fsTools.includes(a.tool) && fsTools.includes(tool) && p.toLowerCase().startsWith(a.path.toLowerCase())) return true;
  }
  return false;
}

/** Called by main.js to provide the IPC sender */
function initPermissionBridge(sendFn) {
  _sender = sendFn;
}

/** Called by router.js — returns a Promise that resolves when user approves/rejects */
function requestPermission(tool, params, displayName) {
  // Auto-approve if already whitelisted for this path
  if (_isApproved(tool, params)) return Promise.resolve(true);

  return new Promise((resolve) => {
    if (!_sender) { resolve(true); return; } // No UI → auto-approve

    const id = 'perm_' + (++_seq) + '_' + Date.now();
    _pending.set(id, { resolve, timer: null, tool, params });

    _sender({
      channel: 'polaris:tool-confirm',
      data: { id, tool, params, displayName },
    });

    // Auto-deny after 60 seconds of no response
    const timer = setTimeout(() => {
      if (_pending.has(id)) {
        _pending.get(id).resolve(false);
        _pending.delete(id);
        _sender({ channel: 'polaris:tool-confirm-dismiss', data: { id } });
      }
    }, 60000);
    _pending.get(id).timer = timer;
  });
}

/** Approve and remember for the whole session (whitelist by path prefix) */
function approveAlwaysPermission(id) {
  const entry = _pending.get(id);
  if (entry) {
    const p = _extractPath(entry.params);
    if (p) {
      // If it's a file, whitelist its parent directory; if it's a dir, whitelist it
      const hasExt = /\.[a-zA-Z0-9]{1,6}$/.test(p);
      const prefix = hasExt ? p.slice(0, p.lastIndexOf('\\')) : p;
      _approvedPrefixes.push({ tool: entry.tool, path: prefix || p });
    }
    if (entry.timer) clearTimeout(entry.timer);
    _pending.delete(id);
    entry.resolve(true);
    return true;
  }
  return false;
}

/** Called by main.js IPC handler when user approves */
function approvePermission(id) {
  const entry = _pending.get(id);
  if (entry) {
    if (entry.timer) clearTimeout(entry.timer);
    _pending.delete(id);
    entry.resolve(true);
    return true;
  }
  return false;
}

/** Called by main.js IPC handler when user rejects */
function rejectPermission(id) {
  const entry = _pending.get(id);
  if (entry) {
    if (entry.timer) clearTimeout(entry.timer);
    _pending.delete(id);
    entry.resolve(false);
    return true;
  }
  return false;
}

module.exports = { initPermissionBridge, requestPermission, approvePermission, rejectPermission };

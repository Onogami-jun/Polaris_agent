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

/** Called by main.js to provide the IPC sender */
function initPermissionBridge(sendFn) {
  _sender = sendFn;
}

/** Called by router.js — returns a Promise that resolves when user approves/rejects */
function requestPermission(tool, params, displayName) {
  return new Promise((resolve) => {
    if (!_sender) { resolve(true); return; } // No UI → auto-approve

    const id = 'perm_' + (++_seq) + '_' + Date.now();
    _pending.set(id, { resolve, timer: null });

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

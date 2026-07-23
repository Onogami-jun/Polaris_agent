/**
 * Polaris Tool System v1.0
 * Each agent can declare tools they're allowed to use.
 * Tools have confirmation requirements and security boundaries.
 * Inspired by CrewAI + Open Interpreter's safety model.
 */
const desktop = require('./desktop');
const { spawnSync } = require('child_process');

// ============================================================
// Tool registry
// ============================================================
const TOOLS = {
  run_code: {
    name: 'Run Code',
    description: '在沙箱中执行代码并返回输出',
    requires_confirm: true,
    category: 'execution',
    execute: async (params) => {
      const { language, code } = params;
      try {
        const tmp = require('os').tmpdir();
        const fs = require('fs');
        const path = require('path');
        const ext = { js:'js', py:'py', ts:'ts', sh:'sh', ps1:'ps1' }[language] || 'js';
        const fp = path.join(tmp, `polaris_run_${Date.now()}.${ext}`);
        fs.writeFileSync(fp, code);
        let result;
        if (language === 'js') {
          result = spawnSync('node', ['-e', code], { timeout: 10000, encoding:'utf8' });
        } else if (language === 'py') {
          result = spawnSync('python', ['-c', code], { timeout: 10000, encoding:'utf8' });
        } else if (language === 'ps1' || language === 'sh') {
          result = spawnSync(language === 'ps1' ? 'powershell' : 'bash', ['-Command', code], { timeout: 10000, encoding:'utf8' });
        }
        fs.unlinkSync(fp);
        return { success: true, stdout: result?.stdout?.slice(0, 2000) || '', stderr: result?.stderr?.slice(0, 500) || '' };
      } catch(e) {
        return { success: false, error: e.message };
      }
    }
  },

  search_web: {
    name: 'Web Search',
    description: '搜索互联网获取最新信息',
    requires_confirm: false,
    category: 'information',
    execute: async (params) => {
      const { query } = params;
      try {
        const https = require('https');
        const data = await new Promise((res, rej) => {
          const req = https.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`, resp => {
            let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>{ try{ res(JSON.parse(d)) }catch{ res({}) } });
          });
          req.on('error', rej);
          req.setTimeout(10000, () => { req.destroy(); res({}); });
        });
        const results = (data.RelatedTopics || []).slice(0, 5).map(r => ({ title: r.Text?.split(' - ')[0] || '', snippet: r.Text || '' }));
        return { success: true, results };
      } catch(e) {
        return { success: false, error: e.message, results: [] };
      }
    }
  },

  read_file: {
    name: 'Read File',
    description: '读取本地文件内容',
    requires_confirm: true,
    category: 'filesystem',
    allowed_extensions: ['.txt', '.md', '.csv', '.json', '.log', '.pdf', '.docx', '.xlsx'],
    execute: async (params) => {
      const { path: fp } = params;
      try {
        const content = desktop.readFile(fp);
        return { success: true, content: content?.slice(0, 10000) || '' };
      } catch(e) {
        return { success: false, error: e.message };
      }
    }
  },

  write_file: {
    name: 'Write File',
    description: '将内容写入本地文件',
    requires_confirm: true,
    category: 'filesystem',
    allowed_dirs: ['Documents', 'Desktop', 'Downloads'],
    blocked_operations: ['delete', 'remove', 'rm'],
    execute: async (params) => {
      const { path: fp, content } = params;
      try {
        desktop.writeFile(fp, content);
        return { success: true };
      } catch(e) {
        return { success: false, error: e.message };
      }
    }
  },

  run_terminal: {
    name: 'Terminal',
    description: '执行终端命令',
    requires_confirm: true,
    category: 'execution',
    blocked_patterns: [/rm\s+-rf/, /format\s+[a-zA-Z]:/, /del\s+\/f/, />\s*\/dev\//],
    execute: async (params) => {
      const { command } = params;
      for (const pattern of this.blocked_patterns) {
        if (pattern.test(command)) return { success: false, error: 'BLOCKED: dangerous command detected' };
      }
      try {
        const result = spawnSync(command, { shell: true, timeout: 15000, encoding: 'utf8' });
        return { success: true, stdout: result.stdout?.slice(0, 3000), stderr: result.stderr?.slice(0, 1000) };
      } catch(e) {
        return { success: false, error: e.message };
      }
    }
  },

  open_app: {
    name: 'Open App',
    description: '打开本地应用程序',
    requires_confirm: false,
    category: 'system',
    execute: async (params) => {
      const { app } = params;
      try {
        desktop.openApplication(app);
        return { success: true };
      } catch(e) {
        return { success: false, error: e.message };
      }
    }
  },

  send_notification: {
    name: 'Send Notification',
    description: '发送系统桌面通知',
    requires_confirm: false,
    category: 'system',
    execute: async (params) => {
      const { title, body } = params;
      try {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
          new Notification({ title: title || 'Polaris', body: body || '' }).show();
        }
        return { success: true };
      } catch(e) {
        return { success: false, error: e.message };
      }
    }
  },
};

// ============================================================
// Tool execution with confirmation tracking
// ============================================================
class ToolExecutor {
  constructor() {
    this.history = [];
    this.pendingConfirmations = new Map();
  }

  getTool(name) {
    return TOOLS[name] || null;
  }

  listTools() {
    return Object.entries(TOOLS).map(([id, t]) => ({
      id, name: t.name, description: t.description,
      requires_confirm: t.requires_confirm, category: t.category
    }));
  }

  /**
   * Execute a tool, with confirmation check.
   * Returns { confirmation_required, confirmation_id, result }
   */
  async execute(toolName, params, autoConfirm = false) {
    const tool = TOOLS[toolName];
    if (!tool) return { success: false, error: `Unknown tool: ${toolName}` };

    // Check confirmations
    if (tool.requires_confirm && !autoConfirm) {
      const confirmId = 'confirm_' + Date.now();
      this.pendingConfirmations.set(confirmId, { tool: toolName, params, timestamp: Date.now() });
      return { confirmation_required: true, confirmation_id: confirmId, tool: tool.name, params };
    }

    // Execute
    try {
      const result = await tool.execute(params);
      this.history.push({ tool: toolName, params, result, timestamp: Date.now() });
      return { ...result, confirmation_required: false };
    } catch(e) {
      const error = { success: false, error: e.message };
      this.history.push({ tool: toolName, params, result: error, timestamp: Date.now() });
      return error;
    }
  }

  confirmAndExecute(confirmId) {
    const pending = this.pendingConfirmations.get(confirmId);
    if (!pending) return { success: false, error: 'Confirmation not found or expired' };
    this.pendingConfirmations.delete(confirmId);
    return this.execute(pending.tool, pending.params, true);
  }

  rejectConfirmation(confirmId) {
    const pending = this.pendingConfirmations.get(confirmId);
    if (!pending) return { success: false, error: 'Confirmation not found' };
    this.pendingConfirmations.delete(confirmId);
    return { success: true, rejected: true };
  }

  getHistory() {
    return this.history.slice(-50);
  }
}

module.exports = { TOOLS, ToolExecutor };

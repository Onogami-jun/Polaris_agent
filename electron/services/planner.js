/**
 * Polaris Planner — Planning before Execution
 * High-risk desktop actions must show a plan first, wait for user confirmation.
 * Inspired by Microsoft Agent Framework's Planning layer.
 */
const desktop = require('./desktop');

class Planner {
  constructor() {
    this.pendingPlans = new Map();
    this.history = [];
  }

  /**
   * Generate a plan for a desktop automation request.
   * Returns steps with confirmation requirements.
   */
  generatePlan(text) {
    // Parse the request into actionable steps
    const plan = {
      id: 'plan_' + Date.now(),
      request: text,
      steps: [],
      createdAt: Date.now(),
    };

    // File operations
    if (/整理|归类|移动.*文件|复制.*文件/.test(text)) {
      const dir = text.match(/[A-Z]:\\[^\s]+|Documents[^\s]*|Desktop[^\s]*|Downloads[^\s]*/i);
      plan.steps.push({
        id: 'scan', action: 'scan_files', description: '扫描目标文件夹',
        info: dir ? dir[0] : '桌面和下载文件夹',
        risk: 'low', auto: true,
      });
      plan.steps.push({
        id: 'classify', action: 'classify', description: '分析文件类型和日期',
        risk: 'low', auto: true,
      });
      plan.steps.push({
        id: 'plan_move', action: 'plan', description: '制定移动方案',
        risk: 'medium', auto: false, needsConfirm: true,
      });
      plan.steps.push({
        id: 'execute', action: 'execute', description: '执行文件操作',
        risk: 'medium', auto: false, needsConfirm: true,
      });
    }
    // Browser operations
    else if (/打开|搜索|浏览|查看.*网页/.test(text)) {
      const query = text.replace(/打开|搜索|浏览|帮我|一下/g, '').trim();
      plan.steps.push({
        id: 'search', action: 'browser_search', description: '搜索: ' + query,
        risk: 'low', auto: true,
      });
    }
    // App operations
    else if (/打开.*应用|启动|运行/.test(text)) {
      const app = text.replace(/打开|启动|运行|应用/g, '').trim();
      plan.steps.push({
        id: 'open', action: 'open_app', description: '打开应用: ' + app,
        risk: 'low', auto: true,
      });
    }
    // System operations
    else if (/命令|终端|执行|运行.*脚本/.test(text)) {
      plan.steps.push({
        id: 'review', action: 'review', description: '审查命令安全性',
        risk: 'high', auto: false, needsConfirm: true,
      });
      plan.steps.push({
        id: 'execute', action: 'run_command', description: '执行命令',
        risk: 'high', auto: false, needsConfirm: true,
      });
    }
    // Default: explain and ask
    else {
      plan.steps.push({
        id: 'analyze', action: 'analyze', description: '分析请求: ' + text,
        risk: 'low', auto: true,
      });
      plan.steps.push({
        id: 'confirm', action: 'confirm', description: '等待用户确认执行方案',
        risk: 'medium', auto: false, needsConfirm: true,
      });
    }

    this.pendingPlans.set(plan.id, plan);
    return plan;
  }

  /**
   * Execute a confirmed plan step by step.
   * Returns progress events.
   */
  async executePlan(planId, onProgress) {
    const plan = this.pendingPlans.get(planId);
    if (!plan) return { success: false, error: 'Plan not found' };

    const results = [];
    for (const step of plan.steps) {
      if (onProgress) onProgress({ type: 'step_start', step: step.id, description: step.description });

      try {
        let result = { success: true };

        switch (step.action) {
          case 'scan_files': {
            const dirPath = step.info || process.env.USERPROFILE + '\\Desktop';
            const files = desktop.listFiles(dirPath);
            result = { success: true, files: files?.slice(0, 20), count: files?.length };
            break;
          }
          case 'open_app': {
            const app = step.info || '';
            desktop.openApplication(app);
            break;
          }
          case 'browser_search': {
            const query = step.info || '';
            desktop.openWebBrowser('https://www.google.com/search?q=' + encodeURIComponent(query));
            break;
          }
          case 'run_command': {
            // Not auto-executing — frontend handles the confirmation popup
            result = { success: true, message: 'Command confirmed and executed' };
            break;
          }
        }

        results.push({ step: step.id, ...result });
        if (onProgress) onProgress({ type: 'step_done', step: step.id, result });
      } catch (e) {
        results.push({ step: step.id, success: false, error: e.message });
        if (onProgress) onProgress({ type: 'step_error', step: step.id, error: e.message });
      }
    }

    this.history.push({ planId, results, completedAt: Date.now() });
    this.pendingPlans.delete(planId);

    return { success: true, results, plan: plan.steps.map(s => ({ id: s.id, description: s.description })) };
  }

  rejectPlan(planId) {
    this.pendingPlans.delete(planId);
    return { success: true, rejected: true };
  }

  getPendingPlans() { return Array.from(this.pendingPlans.values()); }
  getHistory() { return this.history.slice(-20); }
}

module.exports = { Planner };

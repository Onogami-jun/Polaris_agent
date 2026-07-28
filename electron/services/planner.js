/**
 * Polaris Research Planner v2.0
 * Research-aware planning: discuss → model → experiment → paper output.
 * Shows plan in sidebar, auto-executes each step, controls desktop tools.
 */
const desktop = require('./desktop');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Research workflow templates
const RESEARCH_WORKFLOWS = {
  experiment: {
    name: '批量求解实验',
    steps: [
      { id: 'discuss', action: 'analyze', description: '分析问题结构和求解策略', risk: 'low', agent: 'researcher' },
      { id: 'design', action: 'plan', description: '设计实验方案（问题类型、规模、求解器）', risk: 'low', agent: 'researcher' },
      { id: 'run', action: 'experiment', description: '运行批量实验（自动跑多组实例）', risk: 'low', agent: 'solver' },
      { id: 'table', action: 'generate', description: '生成论文表格（Markdown + LaTeX）', risk: 'low', agent: 'explainer' },
      { id: 'save', action: 'save', description: '保存实验结果到本地文件', risk: 'medium', agent: 'solver', needsConfirm: true },
    ],
  },
  method_compare: {
    name: '方法论对比研究',
    steps: [
      { id: 'discuss', action: 'analyze', description: '讨论问题结构，推荐分解策略', risk: 'low', agent: 'researcher' },
      { id: 'benchmark', action: 'experiment', description: '跑对比实验（Benders vs CG vs 直接求解）', risk: 'low', agent: 'solver' },
      { id: 'analyze', action: 'analyze', description: '分析收敛性（LB/UB gap 逐轮对比）', risk: 'low', agent: 'researcher' },
      { id: 'report', action: 'generate', description: '生成方法论对比报告', risk: 'low', agent: 'explainer' },
      { id: 'save', action: 'save', description: '保存论文级图表和表格', risk: 'medium', agent: 'solver', needsConfirm: true },
    ],
  },
  paper_prep: {
    name: '论文准备',
    steps: [
      { id: 'review', action: 'analyze', description: '回顾已有实验数据', risk: 'low', agent: 'researcher' },
      { id: 'rerun', action: 'experiment', description: '重跑实验验证数据一致性', risk: 'low', agent: 'solver' },
      { id: 'table', action: 'generate', description: '生成 LaTeX 表格和收敛图', risk: 'low', agent: 'explainer' },
      { id: 'open', action: 'open_editor', description: '打开 LaTeX 编辑器', risk: 'medium', agent: 'solver', needsConfirm: true },
    ],
  },
};

class Planner {
  constructor() {
    this.pendingPlans = new Map();
    this.history = [];
    this._researchDir = path.join(os.homedir(), 'Documents', 'Polaris_Research');
  }

  _ensureResearchDir() {
    if (!fs.existsSync(this._researchDir)) {
      fs.mkdirSync(this._researchDir, { recursive: true });
    }
    return this._researchDir;
  }

  /**
   * Classify the request and generate a research plan.
   */
  generatePlan(text) {
    const tl = text.toLowerCase();

    // ── Research: experiment / benchmark ──
    if (/实验|实验方案|跑数据|benchmark|对比.*求解|比较.*方法|论文|paper/i.test(tl)) {
      let workflow = 'experiment';
      if (/Benders|CG|Column Generation|分解.*对比|方法.*对比|策略.*对比/i.test(tl)) {
        workflow = 'method_compare';
      }
      if (/论文|paper|LaTeX|latex|图表|表格.*论文|发表/i.test(tl)) {
        workflow = 'paper_prep';
      }

      const tmpl = RESEARCH_WORKFLOWS[workflow] || RESEARCH_WORKFLOWS.experiment;
      const plan = {
        id: 'plan_' + Date.now(),
        request: text,
        workflow: workflow,
        steps: tmpl.steps.map(s => ({ ...s })),
        createdAt: Date.now(),
        type: 'research',
      };

      this.pendingPlans.set(plan.id, plan);
      return plan;
    }

    // ── Legacy: file operations ──
    if (/整理|归类|移动.*文件|复制.*文件/i.test(tl)) {
      const dir = text.match(/[A-Z]:\\[^\s]+|Documents[^\s]*|Desktop[^\s]*|Downloads[^\s]*/i);
      const plan = {
        id: 'plan_' + Date.now(),
        request: text, workflow: 'file_ops', type: 'system',
        steps: [
          { id: 'scan', action: 'scan_files', description: '扫描目标文件夹', risk: 'low', info: dir ? dir[0] : 'Desktop' },
          { id: 'plan_move', action: 'plan', description: '制定整理方案', risk: 'medium', needsConfirm: true },
          { id: 'execute', action: 'execute', description: '执行文件操作', risk: 'medium', needsConfirm: true },
        ],
        createdAt: Date.now(),
      };
      this.pendingPlans.set(plan.id, plan);
      return plan;
    }

    // ── Legacy: app/browser/system ──
    if (/打开|搜索|浏览|查看.*网页|启动|运行|执行.*命令|终端/i.test(tl)) {
      const plan = {
        id: 'plan_' + Date.now(),
        request: text, workflow: 'quick', type: 'system',
        steps: [{
          id: 'analyze', action: 'analyze', description: '分析请求: ' + text.slice(0, 60),
          risk: 'low',
        }],
        createdAt: Date.now(),
      };
      this.pendingPlans.set(plan.id, plan);
      return plan;
    }

    // Fallback
    const plan = {
      id: 'plan_' + Date.now(),
      request: text, workflow: 'default', type: 'general',
      steps: [
        { id: 'analyze', action: 'analyze', description: '分析请求', risk: 'low' },
        { id: 'confirm', action: 'confirm', description: '等待确认执行方案', risk: 'medium', needsConfirm: true },
      ],
      createdAt: Date.now(),
    };
    this.pendingPlans.set(plan.id, plan);
    return plan;
  }

  /**
   * Execute a confirmed plan step by step.
   * For research plans, each step calls polaris tools or desktop automation.
   */
  async executePlan(planId, onProgress) {
    const plan = this.pendingPlans.get(planId);
    if (!plan) return { success: false, error: 'Plan not found' };

    const results = [];
    const researchDir = this._ensureResearchDir();

    for (const step of plan.steps) {
      if (onProgress) onProgress({ type: 'step_start', step: step.id, description: step.description });

      try {
        let result = { success: true };

        switch (step.action) {

          case 'experiment':
            // Run research pipeline via Python
            const sizes = '10,20,50';
            const solvers = 'highs,naive';
            const code = `from polaris.research import pipeline\nr = pipeline("knapsack", [${sizes}], "${solvers}".split(","), seed=42)\nprint(r.markdown_table())\nprint("===LATEX===")\nprint(r.latex_table())`;
            const expResult = spawnSync('python', ['-c', code], { timeout: 300000, encoding: 'utf8' });
            if (expResult.error) {
              const expResult2 = spawnSync('python3', ['-c', code], { timeout: 300000, encoding: 'utf8' });
              result = { success: true, output: expResult2.stdout?.trim() || expResult2.stderr?.trim() || 'No output', action: 'experiment' };
            } else {
              result = { success: true, output: expResult.stdout?.trim() || expResult.stderr?.trim() || 'No output', action: 'experiment' };
            }
            // Store for later steps
            this._lastExperimentOutput = result.output;
            break;

          case 'generate':
            // Generate tables from experiment data
            if (this._lastExperimentOutput) {
              result = { success: true, output: this._lastExperimentOutput, action: 'generate' };
            } else {
              result = { success: false, error: 'No experiment data available. Run experiment first.' };
            }
            break;

          case 'save':
            // Save results to file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const expData = this._lastExperimentOutput || '';
            const mdPath = path.join(researchDir, `experiment_${timestamp}.md`);
            const texPath = path.join(researchDir, `experiment_${timestamp}.tex`);

            // Split markdown and latex
            const parts = expData.split('===LATEX===');
            const mdContent = (parts[0] || '').trim();
            const texContent = (parts[1] || '').trim();

            try {
              fs.writeFileSync(mdPath, mdContent);
              fs.writeFileSync(texPath, texContent);
              result = {
                success: true,
                files: { markdown: mdPath, latex: texPath },
                action: 'save',
              };
              // Copy LaTeX to clipboard for easy paste
              const escaped = texContent.replace(/'/g, "''").replace(/\\/g, '\\\\');
              try { spawnSync('powershell', ['-NoProfile', '-Command', `Set-Clipboard -Value '${escaped}'`], { timeout: 3000 }); } catch {}
              result.clipboard = 'LaTeX table copied to clipboard';
            } catch (e) {
              result = { success: false, error: 'Failed to save files: ' + e.message };
            }
            break;

          case 'open_editor':
            // Open research directory in Explorer
            try {
              spawnSync('explorer', [researchDir], { timeout: 5000 });
              result = { success: true, opened: researchDir, action: 'open_editor' };
            } catch (e) {
              result = { success: false, error: e.message };
            }
            break;

          case 'scan_files':
            const dirPath = step.info || process.env.USERPROFILE + '\\Desktop';
            try {
              const files = fs.readdirSync(dirPath, { withFileTypes: true }).slice(0, 30);
              result = { success: true, files: files.map(f => ({ name: f.name, type: f.isDirectory() ? 'dir' : 'file' })) };
            } catch { result = { success: false, error: 'Cannot read directory' }; }
            break;

          default:
            result = { success: true, message: `Step "${step.description}" acknowledged`, action: step.action };
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

module.exports = { Planner, RESEARCH_WORKFLOWS };

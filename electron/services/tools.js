/**
 * Polaris Solver Tool System v2.1
 * Optimization-centric tools: solve, decompose, benchmark.
 */
const { resolvePython, runPython } = require('./python_resolver');

/* ── Safe escaping for Python string interpolation ── */
function safeEscape(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '').slice(0, 5000);
}

// ============================================================
// Tool registry
// ============================================================
const TOOLS = {
  polaris_opt: {
    name: 'Polaris Solver',
    description: '自然语言描述优化问题（背包、排产、指派、调度、选址、VRP等），返回精确最优解。例："背包容量50，价值60 100 120，重量10 20 30"',
    requires_confirm: false,
    category: 'solver',
    execute: async (params) => {
      const { prompt } = params;
      if (!prompt || prompt.trim().length < 3) {
        return { success: false, error: '请提供优化问题描述。\n\n支持的问题类型：\n- 背包："3件物品，价值60 100 120，重量10 20 30，容量50"\n- 排产："排产3个任务，处理时间1 2 3"\n- 指派："指派，成本 10 2 8  5 12 3  7 4 9"\n- VRV："3个客户，距离矩阵...，需求量...，车载量...，车辆数..."' };
      }
      try {
        // Safe escaping: backslashes first, then quotes, then newlines
        const normalized = safeEscape(prompt);
        const code = `from polaris.engine import Engine\nfrom polaris.chat import solve\nprint(solve("${normalized}"))`;
        const result = runPython(code, 60000);
        if (!result.success) {
          return { success: false, error: result.stderr || result.error || '求解失败' };
        }
        const output = result.stdout;
        const errOut = result.stderr || '';
        if (output.includes('ModuleNotFoundError') || output.includes('ImportError') || errOut.includes('ModuleNotFoundError') || errOut.includes('ImportError')) {
          return { success: false, error: 'Polaris 引擎未安装。请在设置→沙箱中一键部署。' };
        }
        return { success: true, result: output };
      } catch(e) {
        return { success: false, error: `求解异常：${e.message}` };
      }
    }
  },

  polaris_decompose: {
    name: 'Analyze Structure',
    description: '分析优化模型的代数结构，推荐分解策略（Benders/CG/直接求解）',
    requires_confirm: false,
    category: 'solver',
    execute: async (params) => {
      const { prompt } = params;
      if (!prompt || prompt.trim().length < 3) return { success: false, error: '请描述优化问题' };
      try {
        const normalized = safeEscape(prompt);
        const code = `from polaris.engine import Engine\nfrom polaris.chat import _parse, _build_model\nparsed = _parse("${normalized}")\nmodel = _build_model(parsed)\neng = Engine()\nresult = eng.solve(model)\nprint(result.summary())`;
        const result = runPython(code, 30000);
        return { success: result.success, result: result.stdout || result.stderr || 'No output' };
      } catch(e) {
        return { success: false, error: e.message };
      }
    }
  },

  polaris_benchmark: {
    name: 'Run Benchmark',
    description: '对比不同求解器（HiGHS/Gurobi/Naive/Benders）在同一问题上的性能',
    requires_confirm: false,
    category: 'solver',
    execute: async (params) => {
      const { problem_type, size } = params;
      const n = size ? parseInt(size) : 20;
      let code;
      if (problem_type === 'knapsack') {
        code = `import numpy as np; np.random.seed(42)\nfrom polaris.problems.knapsack import build_knapsack\nfrom polaris.solvers.highs import HighsSolver\nfrom polaris.solvers.naive import NaiveSolver\nimport time\nvals=np.random.randint(10,200,size=${n}).tolist(); wts=np.random.randint(5,50,size=${n}).tolist()\nm=build_knapsack(vals,wts,sum(wts)*0.5)\nfor sol,name in [(HighsSolver(),'HiGHS'),(NaiveSolver(),'Naive')]:\n try:\n  t0=time.perf_counter();r=sol.solve(m);t=time.perf_counter()-t0\n  print(f'{name}: obj={r.objective_value:.1f}, time={t:.4f}s, status={r.status.value}')\n except Exception as e:\n  print(f'{name}: ERROR — {e}')`;
      } else {
        return { success: false, error: 'Benchmark 目前支持: knapsack' };
      }
      const result = runPython(code, 120000);
      return { success: result.success, result: result.stdout || result.stderr || 'No output' };
    }
  },

  polaris_research: {
    name: 'Research Pipeline',
    description: '全流程科研实验：自动生成多组实例，对比多个求解器，输出 LaTeX/Markdown 论文表格',
    requires_confirm: false,
    category: 'solver',
    execute: async (params) => {
      const { problem, sizes, solvers, seed } = params;
      const p = problem || 'knapsack';
      const sz = sizes || '10,20,50';
      const sl = solvers || 'highs,naive';
      const sd = seed || 42;
      const code = `from polaris.research import pipeline
import json
r = pipeline("${p}", [${sz}], "${sl}".split(","), seed=${sd})
print("=== MARKDOWN ===")
print(r.markdown_table())
print("=== LATEX ===")
print(r.latex_table())
print("=== CONVERGENCE ===")
print(json.dumps(r.convergence_data(), indent=2))
print("=== DONE ===")`;
      const result = runPython(code, 300000);
      return { success: true, result: result.stdout || result.stderr || 'No output' };
    }
  },

  polaris_analyze: {
    name: 'Analyze Structure',
    description: '分析优化模型结构：检测 block-angular、time-indexed 等特征，推荐分解策略',
    requires_confirm: false,
    category: 'solver',
    execute: async (params) => {
      const { prompt } = params;
      const normalized = safeEscape((prompt||'').slice(0,200));
      const code = `from polaris.chat import _parse,_build_model
from polaris.analyze.structure import analyze
try:
 p=_parse("${normalized}")
 m=_build_model(p)
 s=analyze(m)
 print("Labels:",[l.name for l in s.labels])
 print("Strategy:",s.strategy.value)
 print("Vars:",s.n_scalar_vars,"Cons:",s.n_constraints)
except Exception as e:
 print("Error:",e)`;
      const r=runPython(code,15000);
      return {success:true,result:r.stdout||r.stderr||'No output'};
    }
  },

  polaris_model: {
    name: 'Auto Modeling',
    description: '求解任意优化问题（不在预制模板中的新问题）。输入问题描述，Polaris自动识别类型并求解',
    requires_confirm: false,
    category: 'solver',
    execute: async (params) => {
      const prompt = params.prompt || params.code || '';
      if (!prompt || prompt.trim().length < 10) return { success: false, error: '请提供优化问题的完整描述' };
      const normalized = safeEscape(prompt);
      const code = `from polaris.chat import solve; print(solve("${normalized}"))`;
      const r = runPython(code, 30000);
      return { success: r.success, result: r.stdout || r.stderr || '求解失败' };
    }
  },

  polaris_analyzer: {
    name: 'Analyze Results',
    description: '分析实验对比表格，解读性能趋势、异常点、可能原因，给出下一步建议',
    requires_confirm: false,
    category: 'research',
    execute: async (params) => {
      const { data } = params;
      if (!data) return { success: false, error: '请提供实验输出数据' };
      const { analyzeResults } = require('./result_analyzer');
      try {
        const analysis = await analyzeResults(data);
        return { success: true, result: analysis };
      } catch(e) { return { success: false, error: e.message }; }
    }
  },

  polaris_remember: {
    name: 'Experiment Memory',
    description: '记录/查询历史实验。actions: record/save, last/最近, list/列表, context/上下文',
    requires_confirm: false,
    category: 'research',
    execute: async (params) => {
      const { action, meta, problem } = params;
      const mem = require('./experiment_memory');
      if (action === 'record' || action === 'save') return { success: true, result: JSON.stringify(mem.recordExperiment(meta||{})) };
      if (action === 'last' || action === '最近') return { success: true, result: JSON.stringify(mem.lastExperiment(problem)) };
      if (action === 'list' || action === '列表') return { success: true, result: JSON.stringify(mem.listExperiments(problem)) };
      if (action === 'context' || action === '上下文') return { success: true, result: mem.buildExperimentContext(5) };
      return { success: false, error: 'Unknown action. Use: record, last, list, context' };
    }
  },

  polaris_paper: {
    name: 'Paper Draft',
    description: '根据实验结果生成论文草稿段落，风格为运筹学期刊 formal tone',
    requires_confirm: false,
    category: 'research',
    execute: async (params) => {
      const { data, context } = params;
      const key = params.apiKey;
      const { analyzeResults } = require('./result_analyzer');
      const analysis = await analyzeResults(data||'');
      const prompt = '你是运筹学论文审稿人。写一段论文实验草稿（200字内），用正式学术中文。\n上下文：'+(context||'')+'\n分析：'+analysis;
      try {
        const https=require('https');
        const result = await new Promise((res,rej)=>{
          const body=JSON.stringify({model:'deepseek-v4-flash',messages:[{role:'user',content:prompt}],max_tokens:1024,temperature:0.2});
          const req=https.request({hostname:'api.deepseek.com',path:'/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(key||require('./keymanager').getKey()),'Content-Length':Buffer.byteLength(body)},timeout:30000},resp=>{let d='';resp.on('data',c=>d+=c.toString());resp.on('end',()=>{try{res(JSON.parse(d).choices?.[0]?.message?.content||'')}catch{res('')}})});
          req.on('error',()=>res(''));
          req.write(body);req.end();
        });
        return { success: true, result: result || '草稿生成失败，请重试' };
      } catch(e) { return { success: false, error: e.message }; }
    }
  },

  polaris_literature: {
    name: 'Literature Search',
    description: '搜索运筹优化相关文献、论文、方法',
    requires_confirm: false,
    category: 'research',
    execute: async (params) => {
      const { query } = params;
      try {
        const https=require('https');
        const data=await new Promise((res,rej)=>{
          const req=https.get('https://api.duckduckgo.com/?q='+encodeURIComponent(query||'combinatorial optimization decomposition 2024')+'&format=json&no_html=1',resp=>{let d='';resp.on('data',c=>d+=c.toString());resp.on('end',()=>{try{res(JSON.parse(d))}catch{res({})}})});
          req.on('error',rej);req.setTimeout(10000,()=>{req.destroy();res({})});
        });
        const results=(data.RelatedTopics||[]).slice(0,8).map(r=>({title:r.Text?.split(' - ')[0]||'',snippet:r.Text||''}));
        return {success:true,result:JSON.stringify(results),results};
      }catch(e){return{success:false,error:e.message}};
    }
  },

  polaris_qiwen: {
    name: 'Send to Qiwen',
    description: '把当前的实验数据、建模代码或求解结果导出为 Markdown 文件，直接在启文中打开编辑',
    requires_confirm: false,
    category: 'research',
    execute: async (params) => {
      const { content, title } = params;
      if (!content || content.trim().length < 10) return { success: false, error: '请提供要导出的内容' };
      try {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const dir = path.join(os.homedir(), 'Documents', 'Polaris_Research');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const filename = (title || 'polaris_export') + '_' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-');
        const filepath = path.join(dir, filename + '.md');
        fs.writeFileSync(filepath, content);
        // Try open with Qiwen via known paths
        const { spawn } = require('child_process');
        const qiwenPaths = [
          path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'qiwen', 'Qiwen.exe'),
          path.join(os.homedir(), 'AppData', 'Local', 'qiwen', 'Qiwen.exe'),
          'qiwen',
        ];
        let opened = false;
        for (const qp of qiwenPaths) {
          try {
            spawn(qp, [filepath], { detached: true, stdio: 'ignore' }).unref();
            opened = true; break;
          } catch (e) {}
        }
        // Fallback: open the file in default .md handler
        if (!opened) {
          try { spawn('start', ['""', filepath], { shell: true, detached: true, stdio: 'ignore' }).unref(); } catch {}
          try { spawn('open', [filepath], { detached: true, stdio: 'ignore' }).unref(); } catch {}
        }
        return { success: true, result: `已保存至 ${filepath}${opened ? '，正在启文中打开' : '，已打开默认编辑器'}` };
      } catch(e) { return { success: false, error: e.message }; }
    }
  },

  polaris_code: {
    name: 'Code Interaction',
    description: '搜索/读取/写入本地项目文件',
    requires_confirm: true,
    category: 'filesystem',
    execute: async (params) => {
      const { action, filename, content } = params;
      const ci = require('./code_interact');
      if (action === 'find') return { success: true, result: JSON.stringify(ci.findFiles(filename||'')) };
      if (action === 'read') { const c=ci.readFile(filename); return { success: !!c, result: c||'File not found' }; }
      if (action === 'write') return { success: true, result: JSON.stringify(ci.writeFile(filename,content)) };
      return { success: false, error: 'Unknown action. Use: find, read, write' };
    }
  },

  run_code: {
    name: 'Run Code',
    description: '在沙箱中执行 Python 代码',
    requires_confirm: true,
    category: 'execution',
    execute: async (params) => {
      const { code } = params;
      const result = runPython(code, 30000);
      return { success: result.success, stdout: result.stdout?.slice(0, 5000) || '', stderr: result.stderr?.slice(0, 1000) || '' };
    }
  },

  search_web: {
    name: 'Web Search',
    description: '搜索互联网（用于文献调研、算法对比）',
    requires_confirm: false,
    category: 'information',
    execute: async (params) => {
      const { query } = params;
      try {
        const https = require('https');
        const data = await new Promise((res, rej) => {
          const req = https.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}+optimization+OR&format=json&no_html=1`, resp => {
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

  // ── File System tools (Claude Code-style, requires_confirm) ──
  read_file: {
    name: 'Read File',
    description: '读取本地文件内容。参数: path（绝对路径）。每次读取最大 5000 字符。',
    requires_confirm: true,
    category: 'filesystem',
    execute: async (params) => {
      const filepath = params.path || params.filepath || '';
      if (!filepath) return { success: false, error: '请提供文件路径 (path)' };
      try {
        const fs = require('fs');
        if (!fs.existsSync(filepath)) return { success: false, error: '文件不存在: ' + filepath };
        const stat = fs.statSync(filepath);
        if (stat.size > 10 * 1024 * 1024) return { success: false, error: '文件过大（>10MB），拒绝读取' };
        const content = fs.readFileSync(filepath, 'utf8').slice(0, 5000);
        return { success: true, result: content, path: filepath, size: stat.size };
      } catch (e) { return { success: false, error: e.message }; }
    }
  },

  list_dir: {
    name: 'List Directory',
    description: '列出目录内容。参数: path（绝对路径）。',
    requires_confirm: true,
    category: 'filesystem',
    execute: async (params) => {
      const dirpath = params.path || params.dirpath || process.env.USERPROFILE || require('os').homedir();
      try {
        const fs = require('fs');
        const path = require('path');
        if (!fs.existsSync(dirpath)) return { success: false, error: '目录不存在: ' + dirpath };
        const entries = fs.readdirSync(dirpath, { withFileTypes: true }).slice(0, 200);
        const result = entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other',
        }));
        return { success: true, result: JSON.stringify(result), files: result, path: dirpath };
      } catch (e) { return { success: false, error: e.message }; }
    }
  },

  write_file: {
    name: 'Write File',
    description: '写入内容到本地文件。参数: path（绝对路径）, content（文件内容）。',
    requires_confirm: true,
    category: 'filesystem',
    execute: async (params) => {
      const filepath = params.path || params.filepath || '';
      const content = params.content || '';
      if (!filepath) return { success: false, error: '请提供文件路径 (path)' };
      if (!content) return { success: false, error: '请提供文件内容 (content)' };
      try {
        const fs = require('fs');
        const path = require('path');
        const unsafe = /^(\/etc|\/bin|\/sbin|\/usr\/bin|\/usr\/sbin|\/boot|C:\\Windows|C:\\Program Files)/i;
        if (unsafe.test(filepath)) return { success: false, error: '安全限制：不能写入系统目录' };
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filepath, content);
        return { success: true, result: '已写入: ' + filepath, path: filepath, bytes: Buffer.byteLength(content, 'utf8') };
      } catch (e) { return { success: false, error: e.message }; }
    }
  },

  // ── Git / GitHub tools (PR workflow) ──
  git_clone: { name: 'Git Clone', description: '克隆GitHub仓库到本地。参数: url, branch(可选), targetDir(可选)', requires_confirm: false, category: 'git',
    execute: async (params, ghToken) => { const { gitOps } = require('./git_ops'); return gitOps.clone(params, ghToken); }
  },
  git_list_repos: { name: 'List Repos', description: '列出用户的GitHub仓库列表。无需参数。', requires_confirm: false, category: 'git',
    execute: async (params, ghToken) => { const { gitOps } = require('./git_ops'); return gitOps.listRepos(params, ghToken); }
  },
  git_status: {
    name: 'Git Status',
    description: '查看仓库当前状态。参数: dir（仓库路径）',
    requires_confirm: false,
    category: 'git',
    execute: async (params) => {
      const { gitOps } = require('./git_ops');
      return gitOps.status(params);
    }
  },
  git_branch: {
    name: 'Git Branch',
    description: '创建并切换到新分支。参数: dir, name（分支名）',
    requires_confirm: false,
    category: 'git',
    execute: async (params) => {
      const { gitOps } = require('./git_ops');
      return gitOps.branch(params);
    }
  },
  git_commit: {
    name: 'Git Commit',
    description: '暂存并提交更改。参数: dir, message（提交信息）, files(可选，默认所有文件)',
    requires_confirm: true,
    category: 'git',
    execute: async (params) => {
      const { gitOps } = require('./git_ops');
      return gitOps.commit(params);
    }
  },
  git_push: {
    name: 'Git Push',
    description: '推送分支到远程仓库。参数: dir, branch(可选)',
    requires_confirm: true,
    category: 'git',
    execute: async (params, ghToken) => {
      const { gitOps } = require('./git_ops');
      return gitOps.push(params, ghToken);
    }
  },
  git_create_pr: {
    name: 'Create Pull Request',
    description: '创建GitHub Pull Request。参数: dir, title, body(可选), base(可选), head(可选)',
    requires_confirm: true, category: 'git',
    execute: async (params, ghToken) => { const { gitOps } = require('./git_ops'); return gitOps.createPR(params, ghToken); }
  },
  git_pull: { name: 'Git Pull', description: '拉取远程仓库最新更改。参数: dir', requires_confirm: false, category: 'git',
    execute: async (params) => { const { gitOps } = require('./git_ops'); return gitOps.pull(params); }
  },
  git_merge_pr: { name: 'Merge PR', description: '合并GitHub Pull Request。参数: dir, prNumber, method(可选: merge/squash/rebase)', requires_confirm: true, category: 'git',
    execute: async (params, ghToken) => { const { gitOps } = require('./git_ops'); return gitOps.mergePR(params, ghToken); }
  },
  git_list_prs: { name: 'List PRs', description: '查看仓库Pull Request列表。参数: dir, state(可选: open/closed)', requires_confirm: false, category: 'git',
    execute: async (params, ghToken) => { const { gitOps } = require('./git_ops'); return gitOps.listPRs(params, ghToken); }
  },
  git_diff: { name: 'Git Diff', description: '查看暂存和未暂存的diff。参数: dir', requires_confirm: false, category: 'git',
    execute: async (params) => { const { gitOps } = require('./git_ops'); return gitOps.getDiff(params); }
  },
  git_pr_diff: { name: 'PR Diff', description: '查看Pull Request的代码差异。参数: dir, prNumber', requires_confirm: false, category: 'git',
    execute: async (params, ghToken) => { const { gitOps } = require('./git_ops'); return gitOps.getPRDiff(params, ghToken); }
  },
  git_list_issues: { name: 'List Issues', description: '查看仓库Issue列表。参数: dir, state(可选), labels(可选)', requires_confirm: false, category: 'git',
    execute: async (params, ghToken) => { const { gitOps } = require('./git_ops'); return gitOps.listIssues(params, ghToken); }
  },
  git_create_issue: { name: 'Create Issue', description: '创建GitHub Issue。参数: dir, title, body(可选), labels(可选)', requires_confirm: true, category: 'git',
    execute: async (params, ghToken) => { const { gitOps } = require('./git_ops'); return gitOps.createIssue(params, ghToken); }
  },
  git_workflows: { name: 'CI Workflows', description: '查看仓库GitHub Actions运行状态。参数: dir', requires_confirm: false, category: 'git',
    execute: async (params, ghToken) => { const { gitOps } = require('./git_ops'); return gitOps.listWorkflows(params, ghToken); }
  },
  git_release: { name: 'Create Release', description: '创建Tag和GitHub Release。参数: dir, tag, name(可选), body(可选)', requires_confirm: true, category: 'git',
    execute: async (params, ghToken) => { const { gitOps } = require('./git_ops'); return gitOps.createRelease(params, ghToken); }
  },
};

// ============================================================
// Tool execution
// ============================================================
class ToolExecutor {
  constructor() {
    this.history = [];
    this.pendingConfirmations = new Map();
  }

  getTool(name) { return TOOLS[name] || null; }

  listTools() {
    return Object.entries(TOOLS).map(([id, t]) => ({
      id, name: t.name, description: t.description,
      requires_confirm: t.requires_confirm, category: t.category
    }));
  }

  async execute(toolName, params, autoConfirm = false) {
    const tool = TOOLS[toolName];
    if (!tool) {
      try { const log = require('./logger'); log.warn('Tool not found', { tool: toolName }); } catch {}
      return { success: false, error: `Unknown tool: ${toolName}` };
    }
    if (tool.requires_confirm && !autoConfirm) {
      const confirmId = 'confirm_' + Date.now();
      this.pendingConfirmations.set(confirmId, { tool: toolName, params, timestamp: Date.now() });
      return { confirmation_required: true, confirmation_id: confirmId, tool: tool.name, params };
    }
    const t0 = Date.now();
    try {
      const result = await tool.execute(params);
      const elapsed = Date.now() - t0;
      try { const log = require('./logger'); log.info('Tool executed', { tool: toolName, ms: elapsed, ok: true }); } catch {}
      this.history.push({ tool: toolName, params, result, timestamp: Date.now() });
      return { ...result, confirmation_required: false, elapsed };
    } catch(e) {
      const elapsed = Date.now() - t0;
      try { const log = require('./logger'); log.error('Tool failed', { tool: toolName, ms: elapsed, error: e.message }); } catch {}
      const error = { success: false, error: e.message, elapsed };
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
    this.pendingConfirmations.delete(confirmId);
    return { success: true, rejected: true };
  }

  getHistory() { return this.history.slice(-50); }
}

module.exports = { TOOLS, ToolExecutor };

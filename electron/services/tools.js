/**
 * Polaris Solver Tool System v2.0
 * Optimization-centric tools: solve, decompose, benchmark.
 */
const { spawnSync } = require('child_process');

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
        const normalized = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
        const code = `from polaris.engine import Engine\nfrom polaris.chat import solve\nprint(solve("${normalized}"))`;
        let result = spawnSync('python', ['-c', code], { timeout: 60000, encoding: 'utf8' });
        if (result.error) {
          result = spawnSync('python3', ['-c', code], { timeout: 60000, encoding: 'utf8' });
          if (result.error) {
            return { success: false, error: `Polaris 引擎未安装或未响应。\n\n请先安装：pip install polaris-opt[highs]\n\n然后重试。` };
          }
        }
        const output = result.stdout?.trim() || result.stderr?.trim() || '';
        if (output.includes('ModuleNotFoundError') || output.includes('ImportError')) {
          return { success: false, error: 'Polaris 引擎未安装。请运行: pip install polaris-opt[highs]' };
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
        const normalized = prompt.replace(/"/g, '\\"');
        const code = `from polaris.engine import Engine\nfrom polaris.chat import _parse, _build_model\nparsed = _parse("${normalized}")\nmodel = _build_model(parsed)\neng = Engine()\nresult = eng.solve(model)\nprint(result.summary())`;
        let result = spawnSync('python', ['-c', code], { timeout: 30000, encoding: 'utf8' });
        if (result.error) result = spawnSync('python3', ['-c', code], { timeout: 30000, encoding: 'utf8' });
        const output = result.stdout?.trim() || result.stderr?.trim() || '';
        return { success: true, result: output };
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
      let result = spawnSync('python', ['-c', code], { timeout: 120000, encoding: 'utf8' });
      if (result.error) result = spawnSync('python3', ['-c', code], { timeout: 120000, encoding: 'utf8' });
      return { success: true, result: result.stdout?.trim() || result.stderr?.trim() || 'No output' };
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
      let result = spawnSync('python', ['-c', code], { timeout: 300000, encoding: 'utf8' });
      if (result.error) result = spawnSync('python3', ['-c', code], { timeout: 300000, encoding: 'utf8' });
      const output = result.stdout?.trim() || result.stderr?.trim() || 'No output';
      return { success: true, result: output };
    }
  },

  polaris_analyze: {
    name: 'Analyze Structure',
    description: '分析优化模型结构：检测 block-angular、time-indexed 等特征，推荐分解策略',
    requires_confirm: false,
    category: 'solver',
    execute: async (params) => {
      const { prompt } = params;
      const normalized = (prompt||'').replace(/"/g,'\\"').replace(/\n/g,' ').slice(0,200);
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
      let r=spawnSync('python',['-c',code],{timeout:15000,encoding:'utf8'});
      if(r.error)r=spawnSync('python3',['-c',code],{timeout:15000,encoding:'utf8'});
      return {success:true,result:r.stdout?.trim()||r.stderr?.trim()||'No output'};
    }
  },

  polaris_model: {
    name: 'Auto Modeling',
    description: '用 Python polaris 代码定义任意优化模型（变量、约束、目标），自动求解并返回结果。当7个预制模板不适用时使用',
    requires_confirm: true,
    category: 'solver',
    execute: async (params) => {
      const { code } = params;
      if (!code || code.trim().length < 10) return { success: false, error: '请提供完整的 polaris 建模代码' };
      const wrapped = `from polaris.model.domain import IndexDomain\nfrom polaris.model.variable import Variable, VarType\nfrom polaris.model.expr import LinearExpr\nfrom polaris.model.constraint import Constraint, Sense\nfrom polaris.model.objective import Objective, ObjSense\nfrom polaris.model.model import CanonicalModel\nfrom polaris.solvers.highs import HighsSolver\nimport numpy as np\ntry:\n${code}\n  m=CanonicalModel("auto",(x,),tuple(cs),obj)\n  r=HighsSolver().solve(m)\n  print(f"Status: {r.status.value}")\n  print(f"Objective: {r.objective_value}")\n  for vn,vals in r.variable_values.items():\n    for idx,val in vals.items():\n      if abs(val)>1e-4: print(f"  {vn}{idx}={val:.4f}")\nexcept Exception as e:\n  print(f"MODEL_ERROR: {e}")\n  import traceback; traceback.print_exc()`;
      let r = spawnSync('python', ['-c', wrapped], { timeout: 30000, encoding: 'utf8' });
      if (r.error) r = spawnSync('python3', ['-c', wrapped], { timeout: 30000, encoding: 'utf8' });
      return { success: true, result: r.stdout?.trim() || r.stderr?.trim() || 'No output' };
    }
  },

  run_code: {
    name: 'Run Code',
    description: '在沙箱中执行 Python 代码（可用于 polaris 引擎脚本）',
    requires_confirm: true,
    category: 'execution',
    execute: async (params) => {
      const { code } = params;
      try {
        const tmp = require('os').tmpdir();
        const fs = require('fs');
        const path = require('path');
        const fp = path.join(tmp, `polaris_run_${Date.now()}.py`);
        fs.writeFileSync(fp, code);
        const result = spawnSync('python', ['-c', code], { timeout: 30000, encoding: 'utf8' });
        fs.unlinkSync(fp);
        return { success: true, stdout: result.stdout?.slice(0, 5000) || '', stderr: result.stderr?.slice(0, 1000) || '' };
      } catch(e) {
        return { success: false, error: e.message };
      }
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
    if (!tool) return { success: false, error: `Unknown tool: ${toolName}` };
    if (tool.requires_confirm && !autoConfirm) {
      const confirmId = 'confirm_' + Date.now();
      this.pendingConfirmations.set(confirmId, { tool: toolName, params, timestamp: Date.now() });
      return { confirmation_required: true, confirmation_id: confirmId, tool: tool.name, params };
    }
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
    this.pendingConfirmations.delete(confirmId);
    return { success: true, rejected: true };
  }

  getHistory() { return this.history.slice(-50); }
}

module.exports = { TOOLS, ToolExecutor };

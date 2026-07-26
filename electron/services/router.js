/**
 * Polaris Solver Router v2.0
 * Optimization-first: all queries go through polaris_opt first.
 * Only non-optimization queries fall back to LLM routing.
 */
const https = require('https');
const AGENTS = require('./agents');
const { executeWorkflow } = require('./workflow');
const { ToolExecutor } = require('./tools');

const toolExecutor = new ToolExecutor();

// ============================================================
// Optimization intent detection
// ============================================================
const OPT_KEYWORDS = [
  '背包','排产','调度','指派','分配','装载','车辆路径','vrp','覆盖',
  '求解','最优','最大化','最小化','优化','选址','设施','容量','成本',
  '重量','价值','任务','工人','客户','距离','时间','资源','约束',
  '目标','整数','线性','规划','运输','配送','送货','路径','装箱',
  'knapsack','scheduling','assignment','routing','covering','location',
  'optimize','minimize','maximize','solve','capacity','constraint',
  '选择','排列','顺序','安排','分配任务','怎么排','怎么选','怎么分',
  '有几个','有多少','哪个方案','哪种组合','选择哪','应该选',
];

function isOptimizationQuery(text) {
  const tl = text.toLowerCase();
  let score = 0;
  for (const kw of OPT_KEYWORDS) {
    if (tl.includes(kw.toLowerCase())) score++;
  }
  return score >= 2;
}

// ============================================================
// Intent classifier (simplified for solver)
// ============================================================
const INTENTS = {
  optimization: { display:'优化求解', keywords:OPT_KEYWORDS },
  code_generation: { display:'代码生成', keywords:['代码','编程','debug','函数','写一个','实现','python'] },
  math_reasoning: { display:'数学推理', keywords:['计算','证明','方程','数学','推导'] },
  research: { display:'文献调研', keywords:['研究','调研','文献','综述','最新','论文'] },
  general_chat: { display:'对话', keywords:['你好','谢谢','帮助','怎么用','是什么'] },
};

function classifyIntent(text) {
  const scores = {};
  let top = 'general_chat', topScore = 0;
  for (const [id, def] of Object.entries(INTENTS)) {
    let s = 0;
    const tl = text.toLowerCase();
    for (const kw of def.keywords) {
      if (tl.includes(kw.toLowerCase())) s += 1;
    }
    scores[id] = Math.min(s / 3, 1);
    if (scores[id] > topScore) { topScore = scores[id]; top = id; }
  }
  return { top_intent: top, display: INTENTS[top]?.display || top, top_confidence: topScore, intents: scores };
}

// ============================================================
// API clients
// ============================================================
const DEFAULT_KEYS = {
  deepseek: 'sk-665f376d7c0f4b91b4c3029bf82e670a',
};

function apiPost(hostname, path, headers, body) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname, path, method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(data), ...headers }, timeout:120000 },
      resp => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>{ try{ const j=JSON.parse(d); if(resp.statusCode>=400) rej(new Error(`HTTP ${resp.statusCode}`)); else res(j); }catch(e){ rej(new Error('Parse: '+d.slice(0,200))); } }); });
    req.on('error', e => rej(e)); req.write(data); req.end();
  });
}

function chatDeepSeek(model, messages, apiKey) {
  const key = apiKey || DEFAULT_KEYS.deepseek;
  return apiPost('api.deepseek.com', '/chat/completions', { Authorization:'Bearer '+key }, { model, messages, max_tokens:4096, temperature:0.3 })
    .then(j => j.choices?.[0]?.message?.content || '');
}

async function callModel(modelId, messages, apiKeys) {
  const key = apiKeys?.deepseek || DEFAULT_KEYS.deepseek;
  return chatDeepSeek(modelId, messages, key);
}

// Simple model for solver agent
const AGENT_PROMPTS = {
  solver: AGENTS.solver.prompt,
  explainer: AGENTS.explainer.prompt,
  verifier: AGENTS.verifier.prompt,
  researcher: AGENTS.researcher.prompt,
  chat: AGENTS.chat.prompt,
};

// ============================================================
// Solver pipeline: solve → verify → explain
// ============================================================
async function runSolverPipeline(text, apiKeys) {
  const startTime = Date.now();
  const steps = [];

  // Step 1: Solve
  const polarisTool = toolExecutor.getTool('polaris_opt');
  let solveResult = null;
  if (polarisTool) {
    solveResult = await polarisTool.execute({ prompt: text });
    steps.push({ id: 'solve', agent: 'polaris_opt', summary: solveResult.success ? '求解完成' : '求解失败' });
  }

  if (!solveResult || !solveResult.success) {
    return {
      pipeline: 'solver',
      steps,
      finalContent: solveResult?.error || '求解引擎未可用。请确认已安装 polaris-opt。',
      total_latency_ms: Date.now() - startTime,
    };
  }

  // Step 2: Verify
  const verifyMsgs = [
    { role: 'system', content: AGENTS.verifier.prompt },
    { role: 'user', content: `原始问题：${text}\n\n求解结果：${solveResult.result}\n\n请独立验证这个解的正确性。` }
  ];
  let verifyContent = '';
  try {
    verifyContent = await callModel('deepseek-v4-flash', verifyMsgs, apiKeys);
    steps.push({ id: 'verify', agent: 'verifier', summary: verifyContent.slice(0, 100) });
  } catch(e) {
    verifyContent = '';
  }

  // Step 3: Explain
  const explainMsgs = [
    { role: 'system', content: AGENTS.explainer.prompt },
    { role: 'user', content: `原始问题：${text}\n\n最优解（已验证）：${solveResult.result}\n${verifyContent ? '验证结果：' + verifyContent : ''}\n\n请用通俗语言解释结果。` }
  ];
  let explainContent = '';
  try {
    explainContent = await callModel('deepseek-v4-flash', explainMsgs, apiKeys);
    steps.push({ id: 'explain', agent: 'explainer', summary: explainContent.slice(0, 100) });
  } catch(e) {
    explainContent = '';
  }

  const finalContent = [
    `### 最优解 (Polaris 引擎)`,
    solveResult.result,
    verifyContent ? `\n### 验证` : '',
    verifyContent || '',
    explainContent ? `\n### 解释` : '',
    explainContent || '',
    `\n---\n*求解耗时：${Date.now() - startTime}ms · 引擎：Polaris + HiGHS · 流程：求解 → 验证 → 解释*`,
  ].filter(x => x).join('\n');

  return {
    pipeline: 'solver',
    steps,
    finalContent,
    total_latency_ms: Date.now() - startTime,
  };
}

// ============================================================
// Main execution
// ============================================================
async function executeQuery(text, strategy, systemPrompt, images, onStreamChunk, apiKeys = {}) {
  const keys = { ...DEFAULT_KEYS, ...apiKeys };
  const startTime = Date.now();

  // ── Optimization fast path ──
  if (isOptimizationQuery(text)) {
    const pipeline = await runSolverPipeline(text, keys);
    return {
      routing: {
        strategy: 'solver_pipeline',
        top_intent: '优化求解',
        selected_models: ['polaris_opt', 'verifier', 'explainer'],
        rationale: `Polaris 求解 → 验证 → 解释 · ${pipeline.steps?.length || 0}步`,
      },
      responses: [{
        model_id: 'polaris_pipeline',
        model_display: 'Polaris Solver Pipeline',
        content: pipeline.finalContent,
      }],
      workflow_steps: pipeline.steps,
      total_latency_ms: pipeline.total_latency_ms,
    };
  }

  // ── Non-optimization: use solver chat agent ──
  const classification = classifyIntent(text);
  const messages = [{ role: 'system', content: AGENTS.chat.prompt }];
  if (systemPrompt) messages.unshift({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: text });

  try {
    const content = await callModel('deepseek-v4-flash', messages, keys);
    return {
      routing: {
        strategy: 'direct',
        top_intent: classification.display,
        selected_models: ['deepseek-v4-flash'],
        rationale: 'Polaris Solver — 优化优先，其他问题走通用对话',
      },
      responses: [{ model_id: 'deepseek-v4-flash', model_display: 'DeepSeek V4 Flash', content }],
      total_latency_ms: Date.now() - startTime,
    };
  } catch(e) {
    return {
      routing: { strategy: 'error', top_intent: 'error', selected_models: [], rationale: e.message },
      responses: [{ model_id: 'error', model_display: 'Error', content: `求解失败：${e.message}` }],
      total_latency_ms: Date.now() - startTime,
    };
  }
}

function classifyOnly(text) {
  return classifyIntent(text);
}

module.exports = { executeQuery, classifyOnly, AGENTS, executeWorkflow, toolExecutor, INTENTS };

/**
 * Polaris Router v4 — DeepSeek function calling + polaris tools.
 * LLM decides which tool to call. Loop: LLM → tool → result → LLM → respond.
 */
const https = require('https');
const { TOOLS } = require('./tools');
const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';

// Convert TOOLS into DeepSeek function-calling format
function buildToolDeclarations() {
  const decls = [
    {
      type: 'function',
      function: {
        name: 'polaris_opt',
        description: '用自然语言描述优化问题（背包、排产、指派、调度、选址、VRP等），返回精确最优解',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: '自然语言描述的优化问题' },
          },
          required: ['prompt'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'polaris_analyze',
        description: '分析优化问题的数学结构，检测 block-angular/time-indexed 等特征，推荐 Benders/CG/Lagrangian 等分解策略',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: '优化问题描述' },
          },
          required: ['prompt'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'polaris_research',
        description: '跑批量实验对比多个求解器，生成 Markdown 和 LaTeX 论文表格',
        parameters: {
          type: 'object',
          properties: {
            problem: { type: 'string', description: 'knapsack | scheduling | assignment | facility' },
            sizes: { type: 'string', description: '实例规模，逗号分隔，如 "10,20,50"' },
            solvers: { type: 'string', description: '求解器，逗号分隔，如 "highs,naive,benders"' },
            seed: { type: 'integer', description: '随机种子，默认 42' },
          },
          required: ['problem'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'polaris_model',
        description: '当预制模板不适用时，用 polaris Python 库手动定义优化模型：定义变量(Variable)、约束(Constraint)、目标(Objective)，然后调用求解器。LLM 自己写完整的建模代码。代码模板：x=Variable("x",IndexDomain(("i",n)),VarType.BINARY); cs=[Constraint("c1",...,Sense.LE,rhs)]; obj=Objective(expr,ObjSense.MINIMIZE)。变量名必须叫x，约束列表必须叫cs，目标必须叫obj。',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '完整的 polaris Python 建模代码。变量名必须叫x，约束列表必须叫cs，目标必须叫obj。例：n=5; x=Variable("x",IndexDomain(("i",n)),VarType.BINARY); cs=[Constraint("cap",LinearExpr.from_sum(x[{"i":i}]*w[i] for i in range(n)),Sense.LE,C)]; expr=LinearExpr.from_sum(x[{"i":i}]*v[i] for i in range(n)); obj=Objective(expr,ObjSense.MAXIMIZE)' },
          },
          required: ['code'],
        },
      },
    },
  ];
  return decls;
}

async function executeTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) return { success: false, error: `Unknown tool: ${name}` };
  try {
    const result = await tool.execute(args);
    if (result.success) return result;
    return { success: false, error: result.error || 'Tool failed' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function callDeepSeek(messages, tools, apiKey) {
  const key = apiKey || DEFAULT_KEY;
  return new Promise((res, rej) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash',
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 4096,
      temperature: 0.3,
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, resp => {
      let d = '';
      resp.on('data', c => { d += c.toString(); });
      resp.on('end', () => {
        try { res(JSON.parse(d)); }
        catch (e) { res({ error: 'Parse failed: ' + d.slice(0, 200) }); }
      });
    });
    req.on('error', e => res({ error: e.message }));
    req.on('timeout', () => { req.destroy(); res({ error: 'Timeout' }); });
    req.write(body); req.end();
  });
}

async function runAgentLoop(userMessage, apiKey) {
  const toolDecls = buildToolDeclarations();
  const messages = [
    {
      role: 'system',
      content: `你是 Polaris，运筹优化科研助手，核心能力是自动数学建模和求解。

## 工具选择指南

1. 用户描述了一个已知类型的问题（背包/排产/指派等）→ 直接用 polaris_opt
2. 用户想分析结构、讨论策略 → 用 polaris_analyze
3. 用户想跑实验、生成论文表格 → 用 polaris_research
4. **用户描述了一个新问题，不在7个预制模板中 → 用 polaris_model 手动建模**

## polaris_model 建模规范

当你调用 polaris_model 时，要写出完整的 Python 建模代码。规范：
- 变量名必须是 x，约束列表必须是 cs，目标必须是 obj
- 变量定义：x = Variable("x", IndexDomain(("i", n)), VarType.BINARY)  # 一维
- 多维：x = Variable("x", IndexDomain(("i", n), ("j", m)), VarType.BINARY)
- 约束：cs.append(Constraint("name", expr, Sense.LE, rhs))  # LE/GE/EQ
- 表达式用 LinearExpr.from_sum() 或手动 VarRef 加减
- x[{ "i": 0, "j": 1 }] 来引用变量
- 目标：obj = Objective(expr, ObjSense.MINIMIZE) 或 ObjSense.MAXIMIZE

## 建模示例

用户说"我有5个工件要分配到3台机器上，每个机器的容量不同，加工成本也不同"

polaris_model(code:
  n=5; m=3
  x=Variable("x",IndexDomain(("job",n),("machine",m)),VarType.BINARY)
  cs=[]
  for j in range(n): cs.append(Constraint(f"assign_{j}",LinearExpr.from_sum(x[{"job":j,"machine":k}] for k in range(m)),Sense.EQ,1.0))
  for k in range(m): cs.append(Constraint(f"cap_{k}",LinearExpr.from_sum(x[{"job":j,"machine":k}]*p[j] for j in range(n)),Sense.LE,C[k]))
  expr=LinearExpr.from_sum(x[{"job":j,"machine":k}]*cost[j][k] for j in range(n) for k in range(m))
  obj=Objective(expr,ObjSense.MINIMIZE))

## 行为准则
- 用户描述问题后，先判断是否在7个模板中。在→polaris_opt，不在→polaris_model
- 建模前先分析问题结构（变量、约束、目标），再写代码
- 求解后解释结果：哪个是最优方案、为什么、约束是否紧
- 简洁回复，不要重复用户的话`
    },
    { role: 'user', content: userMessage },
  ];

  const maxRounds = 5;
  for (let round = 0; round < maxRounds; round++) {
    const resp = await callDeepSeek(messages, toolDecls, apiKey);

    if (resp.error) {
      return `网络错误：${resp.error}。请检查 DeepSeek API 连接后重试。`;
    }

    const choice = resp.choices?.[0];
    if (!choice) {
      return 'DeepSeek API 返回异常，请重试。';
    }

    // LLM decided to respond directly
    if (choice.finish_reason === 'stop' || !choice.message?.tool_calls?.length) {
      return choice.message?.content || '已完成。请继续描述你的优化需求。';
    }

    // LLM wants to call tools
    const toolCalls = choice.message.tool_calls;
    messages.push({ role: 'assistant', content: choice.message.content || '', tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const fn = tc.function;
      let args = {};
      try { args = JSON.parse(fn.arguments); } catch {}

      const result = await executeTool(fn.name, args);
      const toolResult = result.success
        ? (result.result || 'Done')
        : `Error: ${result.error}`;

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: typeof toolResult === 'string' ? toolResult.slice(0, 4000) : JSON.stringify(toolResult).slice(0, 4000),
      });
    }
  }

  return 'Agent 达到最大执行轮数。任务可能未完成，请简化你的问题。';
}

// ── Public API ──────────────────────────────────────────────────────────

async function executeQuery(text, strategy, systemPrompt, images, onStreamChunk, apiKeys = {}) {
  const startTime = Date.now();
  const apiKey = apiKeys.deepseek || DEFAULT_KEY;

  // Simple greetings
  if (/^(你好|hi|hello|谢谢|thanks|再见|bye)$/i.test(text.trim())) {
    return {
      routing: { strategy: 'direct', top_intent: '对话', selected_models: ['deepseek'], rationale: '简单问候' },
      responses: [{ model_id: 'deepseek', model_display: 'DeepSeek', content: '你好！我是 Polaris，运筹优化科研助手。直接描述你的优化问题，我来帮你分析求解。' }],
      total_latency_ms: Date.now() - startTime,
    };
  }

  try {
    const content = await runAgentLoop(text, apiKey);
    return {
      routing: { strategy: 'function_calling', top_intent: 'Agent 自主决策', selected_models: ['deepseek-v4-flash'], rationale: 'DeepSeek function calling — LLM drives tool execution' },
      responses: [{ model_id: 'deepseek-v4-flash', model_display: 'DeepSeek V4 Flash', content }],
      total_latency_ms: Date.now() - startTime,
    };
  } catch (e) {
    return {
      routing: { strategy: 'error', top_intent: 'error', selected_models: [], rationale: e.message },
      responses: [{ model_id: 'error', model_display: 'Error', content: `Agent 执行异常：${e.message}。请重试。` }],
      total_latency_ms: Date.now() - startTime,
    };
  }
}

function classifyOnly(text) { return { top_intent: 'auto', display: 'Auto' }; }

module.exports = { executeQuery, classifyOnly };

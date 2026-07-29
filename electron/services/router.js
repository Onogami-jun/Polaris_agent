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
    { type: 'function', function: { name: 'polaris_analyzer', description: '分析实验对比表格，解读性能趋势、异常点、给出原因和建议', parameters: { type: 'object', properties: { data: { type: 'string', description: 'polaris_research 的完整输出' } }, required: ['data'] } } },
    { type: 'function', function: { name: 'polaris_remember', description: '记录/查询历史实验。action: record|last|list|context', parameters: { type: 'object', properties: { action: { type: 'string', description: 'record|last|list|context' }, meta: { type: 'object' }, problem: { type: 'string' } }, required: ['action'] } } },
    { type: 'function', function: { name: 'polaris_paper', description: '根据实验结果生成论文草稿段落，运筹学期刊风格', parameters: { type: 'object', properties: { data: { type: 'string' }, context: { type: 'string' } }, required: ['data'] } } },
    { type: 'function', function: { name: 'polaris_literature', description: '搜索运筹优化相关文献和论文', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'polaris_code', description: '读写本地项目文件。action: find|read|write', parameters: { type: 'object', properties: { action: { type: 'string' }, filename: { type: 'string' }, content: { type: 'string' } }, required: ['action'] } } },
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

async function runAgentLoop(userMessage, apiKey, conversationHistory = []) {
  const { prepareMessages, compressToolOutput, estimateMessageTokens } = require('./token_budget');
  const toolDecls = buildToolDeclarations();
  const maxRounds = 5;

  // Build initial messages with token budget
  let messages = prepareMessages(userMessage, conversationHistory, 0, toolDecls);
  let totalTokens = estimateMessageTokens(messages);
  console.log(`[agent_loop] start — ${totalTokens} tokens`);

  for (let round = 0; round < maxRounds; round++) {
    // Token check before each call
    totalTokens = estimateMessageTokens(messages);
    if (totalTokens > 4000) {
      messages = prepareMessages(userMessage, conversationHistory, round, toolDecls);
      console.log(`[agent_loop] round ${round} — recompressed to ${estimateMessageTokens(messages)} tokens`);
    }

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
    messages.push({
      role: 'assistant',
      content: (choice.message.content || '调用工具...').slice(0, 200),
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const fn = tc.function;
      let args = {};
      try { args = JSON.parse(fn.arguments); } catch {}

      const result = await executeTool(fn.name, args);
      const toolResult = result.success
        ? (result.result || 'Done')
        : `Error: ${result.error}`;

      // ── Layer 2+3: Compress tool output ──
      const raw = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
      const compressed = compressToolOutput(fn.name, raw);
      const saved = raw.length - compressed.length;
      if (saved > 100) {
        console.log(`[agent_loop] ${fn.name}: ${raw.length} → ${compressed.length} chars (${Math.round(saved/raw.length*100)}% saved)`);
      }

            // Auto-record experiment metadata
      if (fn.name === 'polaris_research') {
        try {
          const mem = require('./experiment_memory');
          const mdMatch = compressed.match(/=== MARKDOWN ===\n([\s\S]*?)(?====|$)/);
          const summary = mdMatch ? mdMatch[1].trim().slice(0, 200) : (compressed.slice(0, 200));
          mem.recordExperiment({
            problem: args.problem || 'unknown',
            sizes: args.sizes || '',
            solvers: args.solvers || '',
            seed: args.seed || 42,
            summary: summary,
          });
        } catch(e) { console.warn('Failed to record experiment:', e.message); }
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: compressed,
      });
    }

    // ── Layer 4+5: Sliding window compression ──
    if (messages.length > 8) {
      const { compressMessages } = require('./token_budget');
      messages = compressMessages(messages, 6);
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

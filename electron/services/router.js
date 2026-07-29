/**
 * Polaris Router v4 — DeepSeek function calling + polaris tools.
 * LLM decides which tool to call. Loop: LLM → tool → result → LLM → respond.
 */
const https = require('https');
const { TOOLS } = require('./tools');
const { prepareMessages, compressToolOutput, compressMessages, estimateMessageTokens } = require('./token_budget');
const logger = require('./logger');
const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';

// ── Tools: keep it small so the LLM can navigate ──
function buildToolDeclarations() {
  return [
    { type: 'function', function: { name: 'polaris_solve', description: '求解优化问题。基包/排产/指派/调度/选址/VRP/覆盖等任何优化问题，返回最优解', parameters: { type: 'object', properties: { prompt: { type: 'string', description: '完整的问题描述，包含所有数字和约束' } }, required: ['prompt'] } } },
  ];
}

// ── unified solver tool ──
async function executePolarisSolve(prompt) {
  const normalized = prompt.replace(/"/g,'\\"').replace(/\n/g,' ');
  const code = `from polaris.chat import solve; print(solve("${normalized}"))`;
  const { spawnSync } = require('child_process');
  let r = spawnSync('python', ['-c', code], { timeout: 30000, encoding: 'utf8' });
  if (r.error) r = spawnSync('python3', ['-c', code], { timeout: 30000, encoding: 'utf8' });
  const out = r.stdout?.trim() || r.stderr?.trim() || '';
  if (out.includes('未能识别问题类型') || out.includes('未知问题类型')) {
    return { success: false, error: out.slice(0, 300) };
  }
  return { success: true, result: out };
}

async function executeTool(name, args, onExec) {
  if (onExec) onExec({ tool: name, status: 'running', detail: JSON.stringify(args).slice(0, 100) });

  // Unified solver for all problem types
  if (name === 'polaris_solve') {
    const result = await executePolarisSolve(args.prompt || '');
    if (onExec) onExec({ tool: name, status: result.success ? 'done' : 'error', detail: (result.result || result.error || '').slice(0, 120) });
    return result;
  }

  // Standard tool lookup
  const tool = TOOLS[name];
  if (!tool) {
    if (onExec) onExec({ tool: name, status: 'error', detail: `Tool not found` });
    return { success: false, error: `Unknown tool: ${name}` };
  }
  try {
    const result = await tool.execute(args);
    if (onExec) onExec({ tool: name, status: result.success ? 'done' : 'error', detail: (result.result || result.error || '').slice(0, 120) });
    return result;
  } catch (e) {
    if (onExec) onExec({ tool: name, status: 'error', detail: e.message.slice(0, 120) });
    return { success: false, error: e.message };
  }
}

function callDeepSeek(messages, tools, apiKey) {
  const key = apiKey || DEFAULT_KEY;
  return new Promise(resolve => {
    const body = JSON.stringify({ model: 'deepseek-v4-flash', messages, tools, tool_choice: 'auto', max_tokens: 4096, temperature: 0.3 });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, resp => {
      let d = ''; resp.on('data', c => d += c.toString());
      resp.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ error: 'Parse failed: ' + d.slice(0, 200) }); } });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'Timeout' }); });
    req.write(body); req.end();
  });
}

async function runAgentLoop(userMessage, apiKey, onExec) {
  const toolDecls = buildToolDeclarations();
  const maxRounds = 2;  // 2 rounds max — solve or fallback

  const messages = [
    { role: 'system', content: '你是 Polaris，调用 polaris_solve 工具求解用户描述的任意优化问题。无论背包、排产、指派、调度、选址、VRP、覆盖——把用户的问题原文传给 polaris_solve，它会自动处理。不要分析，不要解释，直接调工具。' },
    { role: 'user', content: userMessage },
  ];

  for (let round = 0; round < maxRounds; round++) {
    const resp = await callDeepSeek(messages, toolDecls, apiKey);
    if (resp.error) return `网络错误：${resp.error}。请重试。`;

    const choice = resp.choices?.[0];
    if (!choice) return 'API 返回异常，请重试。';

    // Direct response from LLM
    if (!choice.message?.tool_calls?.length) {
      const content = choice.message?.content || '';
      if (content.trim().length > 10) return content;
      // Empty response — try talking to the user
      return '我收到了你的问题但无法自动求解。请尝试用更简洁的格式描述：\n- 背包："N件物品，价值...重量...，容量..."\n- 排产："排产N个任务，处理时间..."\n- 指派："指派N个工人，成本矩阵..."';
    }

    // Tool calls
    const toolCalls = choice.message.tool_calls;
    messages.push({ role: 'assistant', content: '正在求解...', tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const fn = tc.function;
      let args = {};
      try { args = JSON.parse(fn.arguments); } catch {}

      // If LLM passed raw text instead of {prompt: "..."}, use the text as prompt
      const prompt = args.prompt || args.code || Object.values(args).join(' ') || userMessage;

      const result = await executeTool(fn.name, { prompt }, onExec);
      const toolResult = result.success ? (result.result || 'Done') : `Error: ${result.error}`;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: typeof toolResult === 'string' ? toolResult.slice(0, 3000) : JSON.stringify(toolResult).slice(0, 3000) });
    }
  }

  // Fallback: direct solve attempt
  const directResult = await executePolarisSolve(userMessage);
  if (directResult.success) return directResult.result;
  return '未能求解。请用更简洁的格式重新描述问题。\n\n支持的问题类型：背包、排产、指派、设施选址、多背包、集合覆盖、VRP。';
}

// ── Public API ──────────────────────────────────────────────────────────

async function executeQuery(text, strategy, systemPrompt, images, onStreamChunk, apiKeys = {}) {
  const startTime = Date.now();
  const apiKey = apiKeys.deepseek || DEFAULT_KEY;
  const tid = logger.newTraceId();
  logger.info('Request received', { tid, text: text.slice(0, 80) });

  // Simple greetings
  if (/^(你好|hi|hello|谢谢|thanks|再见|bye)$/i.test(text.trim())) {
    return {
      routing: { strategy: 'direct', top_intent: '对话', selected_models: ['deepseek'], rationale: '简单问候' },
      responses: [{ model_id: 'deepseek', model_display: 'DeepSeek', content: '你好！我是 Polaris，运筹优化科研助手。直接描述你的优化问题，我来帮你分析求解。' }],
      total_latency_ms: Date.now() - startTime,
    };
  }

  try {
    const onExec = apiKeys.onExec || null;
    const content = await runAgentLoop(text, apiKey, onExec);
    const elapsed = Date.now() - startTime;
    logger.info('Request completed', { tid, ms: elapsed, responseLen: (content||'').length });
    return {
      routing: { strategy: 'function_calling', top_intent: 'Agent 自主决策', selected_models: ['deepseek-v4-flash'], rationale: 'DeepSeek function calling', total_ms: elapsed },
      responses: [{ model_id: 'deepseek-v4-flash', model_display: 'DeepSeek V4 Flash', content }],
      total_latency_ms: elapsed,
    };
  } catch (e) {
    logger.error('Request failed', { tid, error: e.message, ms: Date.now() - startTime });
    return {
      routing: { strategy: 'error', top_intent: 'error', selected_models: [], rationale: e.message },
      responses: [{ model_id: 'error', model_display: 'Error', content: `Agent 执行异常：${e.message}。请重试。` }],
      total_latency_ms: Date.now() - startTime,
    };
  }
}

function classifyOnly(text) { return { top_intent: 'auto', display: 'Auto' }; }

module.exports = { executeQuery, classifyOnly, buildToolDeclarations };

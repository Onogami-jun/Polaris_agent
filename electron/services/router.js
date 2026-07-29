/**
 * Polaris Router v4 — DeepSeek function calling + polaris tools.
 */
const https = require('https');
const { TOOLS } = require('./tools');
const { prepareMessages, compressToolOutput, compressMessages, estimateMessageTokens } = require('./token_budget');
const logger = require('./logger');
const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';

function buildToolDeclarations() {
  return [
    { type: 'function', function: { name: 'polaris_solve', description: '求解优化问题。把用户描述的问题原文传给prompt参数即可', parameters: { type: 'object', properties: { prompt: { type: 'string', description: '用户的问题描述原文' } }, required: ['prompt'] } } },
  ];
}

async function executePolarisSolve(prompt) {
  const normalized = JSON.stringify(prompt);
  const code = `import sys; sys.stdout.reconfigure(encoding='utf-8')\nfrom polaris.chat import solve\nprint(solve(${normalized}))`;
  const { spawnSync: sp } = require('child_process');
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
  let r = sp('python', ['-c', code], { timeout: 30000, encoding: 'utf8', env });
  if (r.error || !r.stdout) r = sp('python3', ['-c', code], { timeout: 30000, encoding: 'utf8', env });
  const out = (r.stdout || r.stderr || '').trim();
  if (out && !out.includes('ModuleNotFoundError') && !out.includes('No module')) return { success: true, result: out };
  return { success: false, error: out || 'Python/polaris not available' };
}

async function executeTool(name, args, onExec) {
  if (onExec) onExec({ tool: name, status: 'running', detail: JSON.stringify(args).slice(0, 100) });
  if (name === 'polaris_solve') {
    const result = await executePolarisSolve(args.prompt || '');
    if (onExec) onExec({ tool: name, status: result.success ? 'done' : 'error', detail: (result.result || result.error || '').slice(0, 120) });
    return result;
  }
  const tool = TOOLS[name];
  if (!tool) {
    if (onExec) onExec({ tool: name, status: 'error', detail: 'Tool not found' });
    return { success: false, error: `Unknown: ${name}` };
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
      resp.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ error: 'Parse failed' }); } });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'Timeout' }); });
    req.write(body); req.end();
  });
}

async function runAgentLoop(userMessage, apiKey, onExec) {
  const toolDecls = buildToolDeclarations();
  const messages = [
    { role: 'system', content: '你是 Polaris 求解助手。收到用户问题后，直接调用 polaris_solve 工具，把用户的问题原文原封不动传给 prompt 参数。不要分析，不要解释，立即调工具。' },
    { role: 'user', content: userMessage },
  ];

  for (let round = 0; round < 2; round++) {
    const resp = await callDeepSeek(messages, toolDecls, apiKey);
    if (resp.error) {
      logger.warn('DeepSeek error, skipping to direct solve', { error: resp.error });
      break;
    }
    const choice = resp.choices?.[0];
    if (!choice) break;
    if (!choice.message?.tool_calls?.length) {
      const content = choice.message?.content || '';
      if (content.trim().length > 20) return content;
      break;
    }
    const toolCalls = choice.message.tool_calls;
    messages.push({ role: 'assistant', content: '正在求解...', tool_calls: toolCalls });
    for (const tc of toolCalls) {
      const fn = tc.function;
      let args = {};
      try { args = JSON.parse(fn.arguments); } catch {}
      const prompt = args.prompt || userMessage;
      const result = await executeTool(fn.name, { prompt }, onExec);
      const toolResult = result.success ? (result.result || 'Done') : `Error: ${result.error}`;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: String(toolResult).slice(0, 3000) });
    }
  }

  // terminal fallback
  const directResult = await executePolarisSolve(userMessage);
  if (directResult.success) return directResult.result;
  return `求解引擎未返回结果。可能的原因：
1. Polaris Python 引擎未安装 → 运行 pip install polaris-opt[highs]
2. Python 版本过低 → 需要 Python 3.11+
3. 问题描述过于复杂 → 请尝试用更简洁的格式重新描述

支持的问题类型：背包、排产、指派、设施选址、多背包、集合覆盖、VRP`;
}

async function executeQuery(text, strategy, systemPrompt, images, onStreamChunk, apiKeys = {}) {
  const startTime = Date.now();
  const apiKey = apiKeys.deepseek || DEFAULT_KEY;
  const tid = logger.newTraceId();
  logger.info('Request received', { tid, text: text.slice(0, 80) });

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
    logger.info('Request completed', { tid, ms: elapsed });
    return {
      routing: { strategy: 'function_calling', top_intent: 'Agent 自主决策', selected_models: ['deepseek-v4-flash'], rationale: 'DeepSeek function calling', total_ms: elapsed },
      responses: [{ model_id: 'deepseek-v4-flash', model_display: 'DeepSeek V4 Flash', content }],
      total_latency_ms: elapsed,
    };
  } catch (e) {
    logger.error('Request failed', { tid, error: e.message });
    return {
      routing: { strategy: 'error', top_intent: 'error', selected_models: [], rationale: e.message },
      responses: [{ model_id: 'error', model_display: 'Error', content: `Agent 执行异常：${e.message}。请重试。` }],
      total_latency_ms: Date.now() - startTime,
    };
  }
}

function classifyOnly(text) { return { top_intent: 'auto', display: 'Auto' }; }

module.exports = { executeQuery, classifyOnly, buildToolDeclarations };

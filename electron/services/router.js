/**
 * Polaris Router v7 — Streaming + Persona + LLM routing
 */
const https = require('https');
const { TOOLS } = require('./tools');
const logger = require('./logger');
const { reliableSolve, diagnose, setReliabilityKey } = require('./reliability');
const { SkillManager } = require('./skills');
const { runPipeline } = require('./subagents');
const { buildAgentCapabilityNote } = require('./health_check');
const { POLARIS_PERSONA } = require('./persona');

// API key supplied by main process after successful auth
const { setKey, getKey } = require('./keymanager');
function setApiKey(k) { setKey(k); }
function getApiKey() { return getKey(); }
const skillManager = new SkillManager();

/* ── Health cache ──────────────────────────────────────── */
let _hcCache = null;
let _hcTime = 0;
async function healthCheckCache() {
  if (_hcCache && Date.now() - _hcTime < 60000) return _hcCache;
  try {
    const { runHealthCheck } = require('./health_check');
    _hcCache = await runHealthCheck();
    _hcTime = Date.now();
  } catch { _hcCache = []; }
  return _hcCache;
}

/* ── Tool declarations ─────────────────────────────────── */
function buildToolDeclarations(skillTools) {
  const map = {
    polaris_opt:       { name: 'polaris_opt',       description: '求解优化问题。将用户描述的问题原文传给 prompt 参数。', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
    polaris_analyze:   { name: 'polaris_analyze',   description: '分析优化问题的代数结构。检测 block-angular、time-indexed 等特征。', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
    polaris_research:  { name: 'polaris_research',  description: '批量实验。参数: problem, sizes, solvers, seed。输出 Markdown/LaTeX 表格。', parameters: { type: 'object', properties: { problem: { type: 'string' }, sizes: { type: 'string' }, solvers: { type: 'string' }, seed: { type: 'number' } } } },
    polaris_remember:  { name: 'polaris_remember',  description: '记录/查询历史实验。action: record/last/list。', parameters: { type: 'object', properties: { action: { type: 'string' } } } },
    polaris_paper:     { name: 'polaris_paper',     description: '根据实验数据生成论文段落草稿。', parameters: { type: 'object', properties: { data: { type: 'string' }, context: { type: 'string' } } } },
    polaris_model:     { name: 'polaris_model',     description: '自动识别并求解非标准优化问题。', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
    polaris_literature:{ name: 'polaris_literature', description: '搜索运筹优化相关文献。', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
    search_web:        { name: 'search_web',        description: '搜索互联网。', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
  };
  const all = [];
  for (const toolName of (skillTools || [])) {
    const def = map[toolName];
    if (def) all.push({ type: 'function', function: def });
  }
  return all;
}

/* ── Python resolver ───────────────────────────────────── */
function resolvePython() {
  const path = require('path'); const os = require('os'); const fs = require('fs');
  const sandboxPy = path.join(os.homedir(), 'AppData', 'Roaming', 'polaris-agent', 'sandbox', 'python.exe');
  if (fs.existsSync(sandboxPy)) {
    const { spawnSync: sp } = require('child_process');
    const r = sp(sandboxPy, ['-c', 'from polaris.chat import solve; print("POLARIS_OK")'], {
      timeout: 5000, encoding: 'utf8', windowsHide: true,
    });
    if (r.status === 0 && r.stdout.includes('POLARIS_OK')) return sandboxPy;
  }
  for (const cmd of ['python', 'python3']) {
    const { spawnSync: sp } = require('child_process');
    const r = sp(cmd, ['-c', 'from polaris.chat import solve; print("POLARIS_OK")'], {
      timeout: 5000, encoding: 'utf8', windowsHide: true,
    });
    if (r.status === 0 && r.stdout.includes('POLARIS_OK')) return cmd;
  }
  return null;
}

/* ── Direct solve ──────────────────────────────────────── */
async function directSolve(userMessage, onExec) {
  const python = resolvePython();
  if (!python) return { success: false, error: '引擎未安装', isEngineMissing: true };
  return reliableSolve(userMessage, onExec, python);
}

/* ── Tool executor ──────────────────────────────────────── */
async function executeTool(name, args, onExec) {
  if (onExec) onExec({ tool: name, status: 'running', detail: JSON.stringify(args).slice(0, 100) });

  if (name === 'polaris_solve' || name === 'polaris_opt') {
    const python = resolvePython();
    if (!python) {
      if (onExec) onExec({ tool: name, status: 'error', detail: '引擎未安装' });
      return { success: false, error: '引擎未安装。可在设置→沙箱中一键部署。' };
    }
    const result = await reliableSolve(args.prompt || args.text || '', onExec, python);
    if (onExec) onExec({ tool: name, status: result.success ? 'done' : 'error', detail: (result.result || result.error || '').slice(0, 120) });
    return result;
  }

  if (name === 'polaris_analyze') {
    const python = resolvePython();
    if (!python) {
      if (onExec) onExec({ tool: name, status: 'error', detail: '引擎未安装' });
      return { success: false, error: '引擎未安装。' };
    }
    const { spawnSync: sp } = require('child_process');
    const n = JSON.stringify(args.prompt || '');
    const code = 'import sys;sys.stdout.reconfigure(encoding="utf-8")\ntry:\n from polaris.chat import _parse,_build_model;from polaris.analyze.structure import analyze\n p=_parse(' + n + ');m=_build_model(p);s=analyze(m)\n print("Labels:",[l.name for l in s.labels]);print("Strategy:",s.strategy.value);print("Vars:",s.n_scalar_vars,"Cons:",s.n_constraints)\nexcept Exception as e:\n print("Analysis:",e)';
    const r = sp(python, ['-c', code], { timeout: 15000, encoding: 'utf8', windowsHide: true });
    const output = (r.stdout || r.stderr || '').trim() || 'Analysis complete';
    if (onExec) onExec({ tool: name, status: 'done', detail: output.slice(0, 200) });
    return { success: true, result: output };
  }

  const tool = TOOLS[name];
  if (!tool) {
    if (onExec) onExec({ tool: name, status: 'error', detail: 'Tool not found' });
    return { success: false, error: `未知工具: ${name}` };
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

/* ══════════════════════════════════════════════════════════
   STREAMING LLM — real SSE, emits chunks to renderer
   ══════════════════════════════════════════════════════════ */

/**
 * Call DeepSeek with true SSE streaming.
 * Emits each content chunk to `onChunk` as it arrives.
 * Returns the full message (content + optional tool_calls).
 */
function callDeepSeekStream(messages, tools, apiKey, temperature, maxTokens, onChunk) {
  const key = apiKey || getApiKey();
  const payload = {
    model: 'deepseek-v4-flash', messages,
    stream: true,
    max_tokens: maxTokens || 4096,
    temperature: temperature || 0.3,
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }
  const body = JSON.stringify(payload);

  return new Promise(resolve => {
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'text/event-stream',
      },
      timeout: 60000,
    }, resp => {
      let buffer = '';
      let fullContent = '';
      let toolCalls = null;

      resp.on('data', chunk => {
        buffer += chunk.toString();
        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;

            if (delta?.content) {
              fullContent += delta.content;
              if (onChunk) onChunk({ type: 'content', text: delta.content, full: fullContent });
            }
            if (delta?.tool_calls) {
              if (!toolCalls) toolCalls = [];
              for (const tc of delta.tool_calls) {
                const idx = tc.index || 0;
                if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id || '', function: { name: '', arguments: '' } };
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
              }
              if (onChunk) onChunk({ type: 'tool_call', toolCalls });
            }
          } catch {}
        }
      });

      resp.on('end', () => {
        const result = { choices: [{ message: { content: fullContent } }] };
        if (toolCalls) result.choices[0].message.tool_calls = toolCalls;
        resolve(result);
      });

      resp.on('error', () => resolve({ choices: [{ message: { content: fullContent || '' } }] }));
    });

    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'Timeout' }); });
    req.write(body); req.end();
  });
}

/**
 * Non-streaming fallback
 */
function callDeepSeek(messages, tools, apiKey, temperature, maxTokens) {
  const key = apiKey || getApiKey();
  return new Promise(resolve => {
    const payload = { model: 'deepseek-v4-flash', messages, max_tokens: maxTokens || 4096, temperature: temperature || 0.3 };
    if (tools && tools.length > 0) { payload.tools = tools; payload.tool_choice = 'auto'; }
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, resp => {
      let d = ''; resp.on('data', c => d += c.toString());
      resp.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ error: 'Parse' }); } });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'Timeout' }); });
    req.write(body); req.end();
  });
}

/* ══════════════════════════════════════════════════════════
   CORE: runAgentLoop (streaming version)
   ══════════════════════════════════════════════════════════ */

async function runAgentLoop(userMessage, apiKey, onExec, onTodo, onStreamChunk) {
  const effectivePrompt = await skillManager.getEffectivePrompt(userMessage);
  const activeSkill = skillManager.getActive();
  const skillName = activeSkill.name;
  logger.info('Skill active', { skill: skillName });

  const hcResults = await healthCheckCache();
  const envNote = buildAgentCapabilityNote(hcResults);

  // ── Inject Polaris persona ──
  const fullPrompt = POLARIS_PERSONA + '\n\n' + effectivePrompt + '\n\n' + envNote;

  // ── Chat / Discuss: streaming first, fallback to non-streaming ──
  if (skillName === '对话模式' || skillName === '讨论模式' || skillName === 'chat' || skillName === 'discuss') {
    if (onExec) onExec({ tool: skillName, status: 'running', detail: '正在思考...' });
    if (onStreamChunk) onStreamChunk({ type: 'thinking', text: '正在分析你的问题...' });

    var content = '';
    try {
      var resp = await callDeepSeekStream(
        [{ role: 'system', content: fullPrompt }, { role: 'user', content: userMessage }],
        [], apiKey, activeSkill.temperature || 0.5, activeSkill.maxTokens || 4096,
        onStreamChunk,
      );
      content = resp.choices?.[0]?.message?.content || '';
    } catch(e) {
      logger.warn('Streaming failed, falling back to non-streaming', { error: e.message });
    }

    // If streaming produced nothing, fall back to non-streaming
    if (!content || content.trim().length < 5) {
      if (onStreamChunk) onStreamChunk({ type: 'thinking', text: '正在生成回复...' });
      var fallback = await callDeepSeek(
        [{ role: 'system', content: fullPrompt }, { role: 'user', content: userMessage }],
        [], apiKey, activeSkill.temperature || 0.5, activeSkill.maxTokens || 4096,
      );
      content = fallback.choices?.[0]?.message?.content || '';
      if (content && onStreamChunk) {
        onStreamChunk({ type: 'content', text: content, full: content });
      }
    }

    if (onExec) onExec({ tool: skillName, status: 'done', detail: '回答完成' });
    return content.trim().length > 10 ? content : '嗯，让我再想想... 你想聊什么方向？';
  }

  // ── Solve / Analyze / Experiment: tool loop ──
  const tools = buildToolDeclarations(activeSkill.tools);
  const messages = [
    { role: 'system', content: fullPrompt },
    { role: 'user', content: userMessage },
  ];

  let bestResponse = '';
  let toolsUsed = false;

  for (let round = 0; round < 3; round++) {
    if (onStreamChunk) onStreamChunk({ type: 'thinking', text: round === 0 ? '分析问题...' : round === 1 ? '执行求解...' : '整理结果...' });
    const resp = await callDeepSeek(messages, tools, apiKey, activeSkill.temperature || 0.2);

    if (resp.error) break;
    const choice = resp.choices?.[0];
    if (!choice) break;

    if (!choice.message?.tool_calls?.length) {
      const content = choice.message?.content || '';
      if (content.trim().length > 20) {
        if (toolsUsed) {
          if (onStreamChunk) onStreamChunk({ type: 'thinking', text: '正在生成回答...' });
          return bestResponse + '\n\n---\n\n' + content;
        }
        return content;
      }
      if (toolsUsed) return bestResponse || '求解完成。';
      break;
    }

    toolsUsed = true;
    const toolCalls = choice.message.tool_calls;
    messages.push({ role: 'assistant', content: choice.message.content || '调用工具...', tool_calls: toolCalls });

    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments); } catch { args = { prompt: userMessage }; }
      if (onStreamChunk) onStreamChunk({ type: 'thinking', text: `调用 ${tc.function.name}...` });
      const result = await executeTool(tc.function.name, args, onExec);
      const toolResult = result.success
        ? (result.result || '已完成')
        : `工具 ${tc.function.name} 返回：${result.error || '失败'}`;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: String(toolResult).slice(0, 3000) });
      if (result.success && result.result) bestResponse = (result.result || '').slice(0, 5000);
    }
  }

  if (toolsUsed && !bestResponse) {
    const dr = await directSolve(userMessage, onExec);
    if (dr.success && dr.result) return dr.result;
  }
  if (bestResponse) return bestResponse;
  return 'Polaris 引擎已尝试求解，但未能得出结果。请提供更详细的问题数据。';
}

/* ══════════════════════════════════════════════════════════
   CORE: executeQuery
   ══════════════════════════════════════════════════════════ */

async function executeQuery(text, strategy, systemPrompt, images, onStreamChunk, apiKeys = {}) {
  const startTime = Date.now();
  const apiKey = apiKeys.deepseek || apiKeys.anthropic || getApiKey();
  const tid = logger.newTraceId();
  logger.info('Request received', { tid, text: text.slice(0, 80) });

  const onExec = apiKeys.onExec || null;
  const onTodo = apiKeys.onTodo || null;

  try {
    const content = await runAgentLoop(text, apiKey, onExec, onTodo, onStreamChunk);
    const elapsed = Date.now() - startTime;
    logger.info('Request completed', { tid, ms: elapsed });

    return {
      routing: {
        strategy: 'semantic',
        top_intent: skillManager.getActive().name,
        selected_models: ['deepseek-v4-flash'],
        rationale: `LLM分类 → ${skillManager.getActive().name}`,
      },
      responses: [{
        model_id: 'deepseek-v4-flash',
        model_display: 'DeepSeek V4 Flash',
        content,
      }],
      total_latency_ms: elapsed,
    };
  } catch (e) {
    logger.error('Request failed', { tid, error: e.message });
    return {
      routing: { strategy: 'error', top_intent: 'error', selected_models: [], rationale: e.message },
      responses: [{ model_id: 'error', model_display: 'Error', content: '处理出错：' + e.message }],
      total_latency_ms: Date.now() - startTime,
    };
  }
}

module.exports = { executeQuery, setApiKey, getApiKey };

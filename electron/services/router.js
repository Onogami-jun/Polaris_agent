/**
 * Polaris Router v6 — LLM-native routing with skill-aware tool calling
 */
const https = require('https');
const { TOOLS } = require('./tools');
const logger = require('./logger');
const { reliableSolve, diagnose } = require('./reliability');
const { SkillManager } = require('./skills');
const { runPipeline } = require('./subagents');
const { buildAgentCapabilityNote } = require('./health_check');

const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';
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

/* ── Tool declarations — built per-skill ───────────────── */
function buildToolDeclarations(skillTools) {
  const all = [];
  const requested = skillTools || skillManager.getActiveTools() || [];

  const map = {
    polaris_opt:       { name: 'polaris_opt',       description: '求解优化问题。将用户描述的问题原文传给 prompt 参数。返回最优解。适用：提供了具体数值数据的场景。', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
    polaris_analyze:   { name: 'polaris_analyze',   description: '分析优化问题的代数结构。检测 block-angular、time-indexed 等特征，推荐求解策略。', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
    polaris_research:  { name: 'polaris_research',  description: '跑批量实验。参数：problem, sizes, solvers, seed。输出 Markdown/LaTeX 论文表格。', parameters: { type: 'object', properties: { problem: { type: 'string' }, sizes: { type: 'string' }, solvers: { type: 'string' }, seed: { type: 'number' } } } },
    polaris_remember:  { name: 'polaris_remember',  description: '记录或查询历史实验。action: record/last/list。', parameters: { type: 'object', properties: { action: { type: 'string' }, meta: { type: 'object' }, problem: { type: 'string' } } } },
    polaris_paper:     { name: 'polaris_paper',     description: '根据实验数据生成论文段落草稿。', parameters: { type: 'object', properties: { data: { type: 'string' }, context: { type: 'string' } } } },
    polaris_model:     { name: 'polaris_model',     description: '自动识别并求解非标准/自定义优化问题。', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
    polaris_literature:{ name: 'polaris_literature',description: '搜索运筹优化相关文献。', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
    search_web:        { name: 'search_web',        description: '搜索互联网获取最新信息。', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
  };

  for (const toolName of requested) {
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

/* ── Direct solve (engine path) ─────────────────────────── */
async function directSolve(userMessage, onExec) {
  const python = resolvePython();
  if (!python) {
    if (onExec) onExec({ tool: 'engine', status: 'error', detail: 'Python/polaris-opt 不可用' });
    return { success: false, error: '引擎未安装', isEngineMissing: true };
  }
  return reliableSolve(userMessage, onExec, python);
}

/* ── Tool executor ──────────────────────────────────────── */
async function executeTool(name, args, onExec) {
  if (onExec) onExec({ tool: name, status: 'running', detail: JSON.stringify(args).slice(0, 100) });

  // polaris_solve & polaris_analyze get auto health-check
  if (name === 'polaris_solve' || name === 'polaris_opt') {
    const python = resolvePython();
    if (!python) {
      const err = '引擎未安装，无法求解。请用你的知识分析这个问题。告知用户可以在设置→沙箱中安装引擎。';
      if (onExec) onExec({ tool: name, status: 'error', detail: '引擎未安装' });
      return { success: false, error: err };
    }
    const result = await reliableSolve(args.prompt || args.text || '', onExec, python);
    if (onExec) onExec({ tool: name, status: result.success ? 'done' : 'error', detail: (result.result || result.error || '').slice(0, 120) });
    return result;
  }

  if (name === 'polaris_analyze') {
    const python = resolvePython();
    if (!python) {
      const err = '引擎未安装。请告诉用户：无法运行结构分析，但你可以根据问题描述推断其代数结构特征。';
      if (onExec) onExec({ tool: name, status: 'error', detail: '引擎未安装' });
      return { success: false, error: err };
    }
    const { spawnSync: sp } = require('child_process');
    const n = JSON.stringify(args.prompt || '');
    const code = 'import sys;sys.stdout.reconfigure(encoding="utf-8")\nfrom polaris.chat import _parse,_build_model\nfrom polaris.analyze.structure import analyze\ntry:\n p=_parse(' + n + ');m=_build_model(p);s=analyze(m)\n print("Labels:",[l.name for l in s.labels])\n print("Strategy:",s.strategy.value)\n print("Vars:",s.n_scalar_vars,"Cons:",s.n_constraints)\nexcept Exception as e:\n print("Analysis:",e)';
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

/* ── LLM API call ───────────────────────────────────────── */
function callDeepSeek(messages, tools, apiKey, temperature = 0.3, maxTokens = 4096) {
  const key = apiKey || DEFAULT_KEY;
  return new Promise(resolve => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash', messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      max_tokens: maxTokens, temperature,
    });
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
   CORE: runAgentLoop
   Routes per intent: chat/discuss → direct LLM | solve/analyze/experiment → tool loop
   ══════════════════════════════════════════════════════════ */

async function runAgentLoop(userMessage, apiKey, onExec, onTodo = null) {
  const effectivePrompt = await skillManager.getEffectivePrompt(userMessage);
  const activeSkill = skillManager.getActive();
  const skillName = activeSkill.name;
  logger.info('Skill active', { skill: skillName, turn: skillManager.conversationTurn });

  // ── Build env awareness ──
  const hcResults = await healthCheckCache();
  const envNote = buildAgentCapabilityNote(hcResults);
  const fullPrompt = effectivePrompt + envNote;

  // ── Chat / Discuss: direct LLM, no tools, no engine ──
  if (skillName === '对话模式' || skillName === '讨论模式' || skillName === 'chat' || skillName === 'discuss') {
    if (onExec) onExec({ tool: skillName, status: 'running', detail: '思考中...' });
    const resp = await callDeepSeek(
      [{ role: 'system', content: fullPrompt }, { role: 'user', content: userMessage }],
      [], apiKey, activeSkill.temperature || 0.5, activeSkill.maxTokens || 4096,
    );
    if (onExec) onExec({ tool: skillName, status: 'done', detail: '回答完成' });
    const content = resp.choices?.[0]?.message?.content || '';
    return content.trim().length > 10 ? content : '请继续。';
  }

  // ── Solve / Analyze / Experiment: tool-calling loop ──
  const tools = buildToolDeclarations(activeSkill.tools);
  const messages = [
    { role: 'system', content: fullPrompt },
    { role: 'user', content: userMessage },
  ];

  let bestResponse = '';
  let toolsUsed = false;

  for (let round = 0; round < 3; round++) {
    const resp = await callDeepSeek(messages, tools, apiKey, activeSkill.temperature || 0.2);

    if (resp.error) break;
    const choice = resp.choices?.[0];
    if (!choice) break;

    // Case 1: LLM returned a text answer (no tool calls needed)
    if (!choice.message?.tool_calls?.length) {
      const content = choice.message?.content || '';
      if (content.trim().length > 20) {
        // If we already used tools, append the LLM's final summary
        if (toolsUsed) return bestResponse + '\n\n---\n\n' + content;
        return content;
      }
      // Very short response — maybe LLM has nothing more to say
      if (toolsUsed) return bestResponse || '求解完成。';
      break;
    }

    // Case 2: LLM wants to call tools
    toolsUsed = true;
    const toolCalls = choice.message.tool_calls;
    messages.push({ role: 'assistant', content: choice.message.content || '调用工具...', tool_calls: toolCalls });

    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments); } catch { args = { prompt: userMessage }; }
      const result = await executeTool(tc.function.name, args, onExec);
      const toolResult = result.success
        ? (result.result || '已完成')
        : `工具 ${tc.function.name} 返回：${result.error || '失败'}`;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: String(toolResult).slice(0, 3000) });

      if (result.success && result.result) {
        bestResponse = (result.result || '').slice(0, 5000);
      }
    }
  }

  // ── Fallback: if tools were used but no clear answer, try direct engine ──
  if (toolsUsed && !bestResponse) {
    if (onExec) onExec({ tool: 'engine:fallback', status: 'running', detail: '尝试直接求解...' });
    const dr = await directSolve(userMessage, onExec);
    if (dr.success && dr.result) return dr.result;
  }

  // ── Final fallback ──
  if (bestResponse) return bestResponse;
  return 'Polaris 引擎已尝试求解。如需更精确的结果，请提供更详细的问题描述和数据。';
}

/* ══════════════════════════════════════════════════════════
   CORE: executeQuery — entry point for IPC
   ══════════════════════════════════════════════════════════ */

async function executeQuery(text, strategy, systemPrompt, images, onStreamChunk, apiKeys = {}) {
  const startTime = Date.now();
  const apiKey = apiKeys.deepseek || apiKeys.anthropic || DEFAULT_KEY;
  const tid = logger.newTraceId();
  logger.info('Request received', { tid, text: text.slice(0, 80) });

  const onExec = apiKeys.onExec || null;
  const onTodo = apiKeys.onTodo || null;

  try {
    // Pass user's custom API keys through
    const content = await runAgentLoop(text, apiKey, onExec, onTodo);
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

module.exports = { executeQuery };

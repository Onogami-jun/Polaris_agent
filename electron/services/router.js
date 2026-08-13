/**
 * Polaris Router v9 — Unified Workflow Engine + Plan-before-Execute
 */
const https = require('https');
const { TOOLS } = require('./tools');
const logger = require('./logger');
const { reliableSolve, diagnose, setReliabilityKey } = require('./reliability');
const { SkillManager } = require('./skills');
const { runPipeline } = require('./subagents');
const { buildAgentCapabilityNote } = require('./health_check');
const AGENTS = require('./agents');
const { POLARIS_PERSONA } = require('./persona');
const { requestPermission } = require('./permission_bridge');
const { verifyAndScore } = require('./verification_engine');
const { planSteps, executePlan, CATEGORIES } = require('./workflow_planner');
const { parseFromLLM } = require('./semantic_dsl');
const { route: routeModel, record: recordRoute, detectProblemType, MODELS: ROUTER_MODELS, callLocalModel } = require('./model_router');
const { recordPath } = require('./skill_graph');
const { recordVerification, recordDPOPair, recordHallucination } = require('./data_flywheel');
const { runAdversarialChecks } = require('./adversarial_verify');

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
    run_code:          { name: 'run_code',          description: '在沙箱中执行 Python 代码。', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
    read_file:         { name: 'read_file',         description: '读取本地文件的文本内容（绝对路径）。支持 .py/.txt/.md/.json 等文本文件。', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    list_dir:          { name: 'list_dir',          description: '列出本地目录的内容（绝对路径）。', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    write_file:        { name: 'write_file',        description: '写入内容到本地文件（绝对路径）。', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
    git_clone:         { name: 'git_clone',         description: '克隆 GitHub 仓库。参数: url, branch(可选)。', parameters: { type: 'object', properties: { url: { type: 'string' }, branch: { type: 'string' } }, required: ['url'] } },
    git_status:        { name: 'git_status',        description: '查看仓库状态。参数: dir。', parameters: { type: 'object', properties: { dir: { type: 'string' } }, required: ['dir'] } },
    git_branch:        { name: 'git_branch',        description: '创建并切换分支。参数: dir, name。', parameters: { type: 'object', properties: { dir: { type: 'string' }, name: { type: 'string' } }, required: ['dir', 'name'] } },
    git_commit:        { name: 'git_commit',        description: '提交更改。参数: dir, message。', parameters: { type: 'object', properties: { dir: { type: 'string' }, message: { type: 'string' } }, required: ['dir', 'message'] } },
    git_push:          { name: 'git_push',          description: '推送分支。参数: dir。', parameters: { type: 'object', properties: { dir: { type: 'string' } }, required: ['dir'] } },
    git_create_pr:     { name: 'git_create_pr',     description: '创建 Pull Request。参数: dir, title, body(可选)。', parameters: { type: 'object', properties: { dir: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['dir', 'title'] } },
  };
  const all = [];
  for (const toolName of (skillTools || [])) {
    const def = map[toolName];
    if (def) all.push({ type: 'function', function: def });
  }
  return all;
}

/* ── Python resolver (shared module) ──────────────────── */
const { resolvePython, runPython: sharedRunPython } = require('./python_resolver');

function getPython() { return resolvePython(); }

/* ── Direct solve ──────────────────────────────────────── */
async function directSolve(userMessage, onExec) {
  const python = resolvePython();
  if (!python) return { success: false, error: '引擎未安装', isEngineMissing: true };
  return reliableSolve(userMessage, onExec, python);
}

/* ── Shared tool executor (single instance for confirms) ── */
const { ToolExecutor } = require('./tools');
const toolExec = new ToolExecutor();

/* ── Tool executor ──────────────────────────────────────── */
async function executeTool(name, args, onExec) {
  if (onExec) onExec({ tool: name, status: 'running', detail: JSON.stringify(args).slice(0, 100) });

  if (name === 'polaris_solve' || name === 'polaris_opt') {
    const python = resolvePython();
    if (!python) {
      if (onExec) onExec({ tool: name, status: 'error', detail: 'Engine not installed' });
      return { success: false, error: 'Engine not installed. Deploy from Settings > Sandbox.' };
    }
    const result = await reliableSolve(args.prompt || args.text || '', onExec, python);
    if (onExec) onExec({ tool: name, status: result.success ? 'done' : 'error', detail: (result.result || result.error || '').slice(0, 120) });
    return result;
  }

  if (name === 'polaris_analyze') {
    const python = resolvePython();
    if (!python) {
      if (onExec) onExec({ tool: name, status: 'error', detail: 'Engine not installed' });
      return { success: false, error: 'Engine not installed.' };
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
    return { success: false, error: 'Unknown tool: ' + name };
  }
  // ★ Thread GitHub token to git tools
  if (tool.category === 'git') {
    try {
      const result = await tool.execute(args, _ghToken || '');
      if (onExec) onExec({ tool: name, status: result.confirmation_required ? 'running' : (result.success ? 'done' : 'error'), detail: result.confirmation_required ? 'Waiting for user approval...' : ((result.result || result.error || '').slice(0, 120)) });
      // Notify renderer so Git panel auto-refreshes
      if (_gitNotify && result) _gitNotify({ tool: name, success: result.success, result: (result.result || '').slice(0, 200), branch: result.branch, dir: result.dir });
      return result;
    } catch (e) { return { success: false, error: e.message }; }
  }
  // ★ Use shared ToolExecutor so confirms work across calls
  try {
    const result = await toolExec.execute(name, args);
    if (onExec) onExec({ tool: name, status: result.confirmation_required ? 'running' : (result.success ? 'done' : 'error'), detail: result.confirmation_required ? 'Waiting for user approval...' : ((result.result || result.error || '').slice(0, 120)) });
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
function callDeepSeekStream(messages, tools, apiKey, temperature, maxTokens, onChunk, modelOverride) {
  // Route to local model if applicable
  if (modelOverride && isLocalModel(modelOverride)) {
    return callLLMUnified(messages, tools, apiKey, temperature, maxTokens, onChunk, modelOverride);
  }
  const key = apiKey || getApiKey();
  var modelName = resolveModel(modelOverride);
  const payload = {
    model: modelName, messages,
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
function callDeepSeek(messages, tools, apiKey, temperature, maxTokens, modelOverride) {
  // Route to local model if applicable
  if (modelOverride && isLocalModel(modelOverride)) {
    return callLLMUnified(messages, tools, apiKey, temperature, maxTokens, null, modelOverride);
  }
  const key = apiKey || getApiKey();
  var modelName = resolveModel(modelOverride);
  return new Promise(resolve => {
    const payload = { model: modelName, messages, max_tokens: maxTokens || 4096, temperature: temperature || 0.3 };
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

/* ── Unified LLM call — routes local or remote ──────────── */
async function callLLMUnified(messages, tools, apiKey, temperature, maxTokens, onChunk, modelOverride) {
  var modelName = modelOverride || 'deepseek-v4-flash';

  // Local model path
  if (isLocalModel(modelName)) {
    try {
      var prompt = '';
      for (var mi = 0; mi < messages.length; mi++) {
        var m = messages[mi];
        if (m.role === 'system') prompt += '<|system|>\n' + m.content + '\n';
        else if (m.role === 'user') prompt += '<|user|>\n' + m.content + '\n';
        else if (m.role === 'assistant') prompt += '<|assistant|>\n' + m.content + '\n';
      }
      prompt += '<|assistant|>\n';
      var result = await callLocalModel(prompt, { maxTokens: maxTokens || 512, temperature: temperature || 0.1 });
      var localContent = (result.content || '').trim();
      // ★ Only use local output if it's substantive; otherwise fall back to DeepSeek
      if (localContent.length > 10) {
        return { choices: [{ message: { content: localContent } }] };
      }
      logger.info('Local model returned empty/short output, falling back to DeepSeek', { len: localContent.length });
      modelName = 'deepseek-v4-flash';
    } catch(e) {
      // Fallback to DeepSeek flash if local model fails
      modelName = 'deepseek-v4-flash';
    }
  }

  // Prefer streaming if onChunk provided
  if (onChunk) {
    return callDeepSeekStream(messages, tools, apiKey, temperature, maxTokens, onChunk, modelName);
  }
  return callDeepSeek(messages, tools, apiKey, temperature, maxTokens, modelName);
}

/* ── Resolve routed model to an actual API model ─────────── */
function resolveModel(routeId) {
  // Local model → handled by callLLMUnified's local path
  if (routeId === 'polaris-opt-local') return routeId;
  // DeepSeek models → use directly
  if (routeId === 'deepseek-v4-flash' || routeId === 'deepseek-v4') return routeId;
  // Anything else (claude/gpt/unknown) → always fall back to DeepSeek Flash
  return 'deepseek-v4-flash';
}

function isLocalModel(modelName) {
  return modelName === 'polaris-opt-local';
}

/* ══════════════════════════════════════════════════════════
   CORE: runAgentLoop — Claude Code-style while(true) + QC + Handoff
   ══════════════════════════════════════════════════════════ */

// ── Pick an agent by name ──
function getAgentById(id) {
  return AGENTS[id] || AGENTS.chat;
}

// ── Build system prompt for a specific agent ──
function buildAgentPrompt(lang, agentId, effectiveSkillPrompt, envNote) {
  var ln = lang || 'zh-CN';
  const agent = getAgentById(agentId);
  var li = `\n\n[LANGUAGE] Reply in ${langName(ln)} only. All responses must be in ${langName(ln)}.`;
  return POLARIS_PERSONA + '\n\n' + agent.prompt + '\n\n' + li + '\n\n' + effectiveSkillPrompt + '\n\n' + envNote;
}

/** ── Map lang code to English name for the prompt ── */
function langName(code) {
  var m = { 'zh-CN': 'Chinese (Simplified)', 'en': 'English', 'ja': 'Japanese', 'fr': 'French' };
  return m[code] || 'Chinese (Simplified)';
}

// ── Check if content signals completion ──
function isContentComplete(content) {
  if (!content || content.trim().length < 3) return false;
  if (content.includes('[CONTINUE]')) return false;
  if (content.includes('[NEED_MORE]')) return false;
  return true; // accept any non-empty response, LLM decides when done
}

async function runAgentLoop(userMessage, apiKey, onExec, onTodo, onStreamChunk, strategyConfig) {
  var maxTok = (strategyConfig && strategyConfig.maxTokens) || 4096;
  var temp = (strategyConfig && strategyConfig.temperature != null) ? strategyConfig.temperature : 0.3;
  var lang = (strategyConfig && strategyConfig.language) || 'zh-CN'; // ★ Language from frontend
  const effectivePrompt = await skillManager.getEffectivePrompt(userMessage, (strategyConfig && strategyConfig.intent));
  const activeSkill = skillManager.getActive();
  const skillName = activeSkill.name;
  logger.info('Skill active', { skill: skillName, lang: lang });

  const hcResults = await healthCheckCache();
  const envNote = buildAgentCapabilityNote(hcResults);

  // ── Chat only: pure streaming (no tools). Discuss goes to agent loop with tools. ──
  if (skillName === '对话模式' || skillName === 'chat') {
    if (onExec) onExec({ tool: skillName, status: 'running', detail: '正在思考...' });
    if (onStreamChunk) onStreamChunk({ type: 'thinking', text: '正在分析你的问题...' });
    const agentPrompt = buildAgentPrompt(lang,'chat', effectivePrompt, envNote);
    var content = '';
    try {
      // Use the router's chosen model (LLM decided local_ok; chat → local_ok false → DeepSeek)
      var resp = await callLLMUnified(
        [{ role: 'system', content: agentPrompt }, { role: 'user', content: userMessage }],
        [], apiKey, activeSkill.temperature || temp, maxTok, onStreamChunk, (strategyConfig && strategyConfig.routedModel));
      content = resp.choices?.[0]?.message?.content || '';
      logger.info('Chat stream response', { hasContent: !!content, len: content.length, routedModel: strategyConfig && strategyConfig.routedModel });
    } catch(e) { logger.warn('Streaming failed', { error: e.message }); }
    if (!content || content.trim().length < 5) {
      if (onStreamChunk) onStreamChunk({ type: 'thinking', text: '正在生成回复...' });
      var fallback = await callDeepSeek(
        [{ role: 'system', content: agentPrompt }, { role: 'user', content: userMessage }],
        [], apiKey, activeSkill.temperature || temp, maxTok);
      content = fallback.choices?.[0]?.message?.content || '';
      logger.info('Chat fallback response', { hasContent: !!content, len: content.length });
      if (content && onStreamChunk) onStreamChunk({ type: 'content', text: content, full: content });
    }
    if (onExec) onExec({ tool: skillName, status: 'done', detail: '回答完成' });
    return content.trim().length > 10 ? content : '嗯，让我再想想... 你想聊什么方向？';
  }

  // ═══════════════════════════════════════════════════════
  // ★ Fast path: LLM said local_ok + router picked local model
  //   → single-shot local inference, no tool loop needed
  // ═══════════════════════════════════════════════════════
  if ((strategyConfig && strategyConfig.localOk === true) && (strategyConfig.routedModel === 'polaris-opt-local')) {
    if (onStreamChunk) onStreamChunk({ type: 'thinking', text: '本地模型求解中...' });
    const localPrompt = userMessage; // local model is trained on raw optimization text
    try {
      var localResp = await callLLMUnified(
        [{ role: 'system', content: '你是优化求解器。输出最优解和数值。' }, { role: 'user', content: localPrompt }],
        [], apiKey, 0.1, 512, onStreamChunk, 'polaris-opt-local');
      var localContent = (localResp.choices?.[0]?.message?.content || '').trim();
      if (localContent.length > 10) {
        if (onExec) onExec({ tool: 'local_model', status: 'done', detail: '本地模型求解完成' });
        return localContent;
      }
      // Fall through to DeepSeek agent loop if local output is empty
      logger.info('Local model empty, falling back to agent loop');
    } catch(e) { logger.warn('Local fast path failed', { error: e.message }); }
  }

  // ═══════════════════════════════════════════════════════
  // ★ P0: Claude Code-style while(true) agent loop
  // ★ P2: Runtime Handoff — switch agent mid-loop
  // ★ P1: Quality Check — review before returning
  // ═══════════════════════════════════════════════════════

  // Start with the agent that best matches the skill
  var currentAgentId = mapSkillToAgent(skillName);
  var currentAgent = getAgentById(currentAgentId);
  var agentPrompt = buildAgentPrompt(lang,currentAgentId, effectivePrompt, envNote);
  var tools = buildToolDeclarations([...new Set([...activeSkill.tools, ...currentAgent.tools])]); // union of skill+agent tools
  var agentTemp = currentAgent.temperature || activeSkill.temperature || temp;

  const messages = [
    { role: 'system', content: agentPrompt },
    { role: 'user', content: userMessage },
  ];

  var bestResponse = '';
  var toolsUsed = false;
  var allToolCalls = []; // ★ Collect all tool calls across rounds for BARRIER 5
  const MAX_ROUNDS = 10;
  var round = 0;

  // ── P0: while(true) — LLM decides when to stop ──
  while (round < MAX_ROUNDS) {
    round++;
    var thinkingText = round <= 1 ? '分析问题...' : round <= 3 ? `执行第${round}步...` : `继续处理 (${round}/${MAX_ROUNDS})...`;
    if (onStreamChunk) onStreamChunk({ type: 'thinking', text: thinkingText });

    // Agent loop needs tool-call support — resolve via model registry (local maps back to DeepSeek)
    const resp = await callDeepSeek(messages, tools, apiKey, agentTemp, maxTok, resolveModel((strategyConfig && strategyConfig.routedModel)));
    if (resp.error) break;

    const choice = resp.choices?.[0];
    if (!choice) break;

    // ── No tool calls → LLM is done (or giving final answer) ──
    if (!choice.message?.tool_calls?.length) {
      const content = choice.message?.content || '';
      if (isContentComplete(content)) {
        if (toolsUsed) {
          if (onStreamChunk) onStreamChunk({ type: 'thinking', text: '整理结果...' });
          // ── P2: Handoff check ──
          var nextAgent = tryHandoff(currentAgentId, userMessage, content);
          if (nextAgent && nextAgent !== currentAgentId) {
            logger.info('Handoff triggered', { from: currentAgentId, to: nextAgent });
            currentAgentId = nextAgent; currentAgent = getAgentById(currentAgentId);
            agentPrompt = buildAgentPrompt(lang,currentAgentId, effectivePrompt, envNote);
            agentTemp = currentAgent.temperature || activeSkill.temperature || temp;
            tools = buildToolDeclarations([...new Set([...activeSkill.tools, ...currentAgent.tools])]);
            messages[0] = { role: 'system', content: agentPrompt };
            messages.push({ role: 'assistant', content: `[Handoff to ${currentAgent.name}]` });
            messages.push({ role: 'user', content: '上一步结果：\n' + bestResponse + '\n\n请基于此继续处理。' });
            continue; // Continue loop with new agent
          }
          return bestResponse + '\n\n---\n\n' + content;
        }
        return content;
      }
      if (toolsUsed) {
        // LLM output is short but tools were used → it's probably summarizing
        if (onStreamChunk) onStreamChunk({ type: 'thinking', text: '整理结果...' });
        var qcResult = await qualityCheck(userMessage, messages, bestResponse, content, apiKey);
        if (qcResult.needsMore) {
          messages.push({ role: 'user', content: qcResult.feedback });
          continue;
        }
        return bestResponse || content || '求解完成。';
      }
      break; // No tools used, short content → stop
    }

    // ── Tool calls present → execute them ──
    toolsUsed = true;
    const toolCalls = choice.message.tool_calls;
    // Collect for BARRIER 5 (skill graph)
    for (var tci = 0; tci < (toolCalls || []).length; tci++) {
      allToolCalls.push(toolCalls[tci]);
    }
    messages.push({ role: 'assistant', content: choice.message.content || 'Calling tools...', tool_calls: toolCalls });

    for (const tc of toolCalls) {
      var args = {};
      try { args = JSON.parse(tc.function.arguments); } catch { args = { prompt: userMessage }; }
      if (onStreamChunk) onStreamChunk({ type: 'thinking', text: 'Calling ' + tc.function.name + '...' });
      const result = await executeTool(tc.function.name, args, onExec);
      // ── Claude Code-style: tool needs user permission ──
      if (result.confirmation_required) {
        const toolDef = TOOLS[tc.function.name];
        const displayName = toolDef ? toolDef.name : tc.function.name;
        if (onExec) onExec({ tool: tc.function.name, status: 'running', detail: 'Asking for permission...' });
        const userApproved = await requestPermission(tc.function.name, args, displayName);
        if (!userApproved) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: 'User denied this operation.' });
          if (onExec) onExec({ tool: tc.function.name, status: 'error', detail: 'User denied' });
          break;
        }
        // User approved → execute via shared ToolExecutor
        const approved = await toolExec.confirmAndExecute(result.confirmation_id);
        if (!approved || !approved.success) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: 'Execution failed: ' + ((approved && approved.error) || 'unknown') });
          if (onExec) onExec({ tool: tc.function.name, status: 'error', detail: (approved && approved.error) || 'Execution failed' });
          break;
        }
        var apResult = approved.result || approved.stdout || 'Done';
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'User approved. Result:\n' + String(apResult).slice(0, 4000) });
        if (approved.result || approved.stdout) {
          bestResponse = (approved.result || approved.stdout || '').slice(0, 8000);
        }
        if (onExec) onExec({ tool: tc.function.name, status: 'done', detail: String(apResult).slice(0, 120) });
        continue;
      }
      const toolResult = result.success
        ? (result.result || result.stdout || '已完成')
        : '工具 ' + tc.function.name + ' 返回：' + (result.error || '失败');
      messages.push({ role: 'tool', tool_call_id: tc.id, content: String(toolResult).slice(0, 4000) });
      if (result.success && (result.result || result.stdout)) {
        bestResponse = (result.result || result.stdout || '').slice(0, 8000);
      }
    }

    // ── P2: Check if agent should handoff after tool execution ──
    var nextAgent = shouldHandoffAfterTools(currentAgentId, toolCalls, bestResponse);
    if (nextAgent && nextAgent !== currentAgentId) {
      logger.info('Handoff after tools', { from: currentAgentId, to: nextAgent });
      currentAgentId = nextAgent; currentAgent = getAgentById(currentAgentId);
      agentPrompt = buildAgentPrompt(lang,currentAgentId, effectivePrompt, envNote);
      agentTemp = currentAgent.temperature || activeSkill.temperature || temp;
      tools = buildToolDeclarations([...new Set([...activeSkill.tools, ...currentAgent.tools])]);
      messages[0] = { role: 'system', content: agentPrompt };
      messages.push({ role: 'assistant', content: '[Handoff to ' + currentAgent.name + ']' });
    }
  }

  // ── Exhausted rounds → quality check then return best ──
  if (toolsUsed && !bestResponse) {
    const dr = await directSolve(userMessage, onExec);
    if (dr.success && dr.result) return dr.result;
  }

  // ── ★ Verification-First: 投票制验证引擎 ──
  var finalResult = bestResponse || '';
  var dslInstance = null;
  var problemType = 'custom';
  var routedModelId = 'deepseek-v4-flash';
  if (toolsUsed && finalResult && finalResult.length > 20) {
    try {
      if (onStreamChunk) onStreamChunk({ type: 'thinking', text: '验证结果...' });
      var execLog = []; // tool execution log
      var verification = await verifyAndScore(userMessage, finalResult, execLog, messages, apiKey);

      // ★ BARRIER 7: DSL — parse LLM output into structured form
      try {
        dslInstance = parseFromLLM(finalResult, userMessage);
        if (dslInstance.valid && onStreamChunk) onStreamChunk({ type: 'thinking', text: 'DSL valid: ' + dslInstance.type + ' (' + (dslInstance.meta.provenance_counts.user||0) + ' user/' + (dslInstance.meta.provenance_counts.inferred||0) + ' inferred params)' });
      } catch(dslErr) { logger.warn('DSL parse failed', { error: dslErr.message }); }

      // ★ BARRIER 6: Adversarial Verify — run perturbation/mismatch/phrasing checks
      var advResult = null;
      if (dslInstance && dslInstance.valid) {
        try {
          if (onStreamChunk) onStreamChunk({ type: 'thinking', text: '对抗验证...' });
          advResult = await runAdversarialChecks(dslInstance, [finalResult], null);
          if (!advResult.passed && onStreamChunk) onStreamChunk({ type: 'thinking', text: '⚠️ 对抗验证未通过: ' + (advResult.details || []).filter(function(d){return d.indexOf('FAIL')>=0}).join('; ') });
        } catch(advErr) { logger.warn('Adversarial verify failed', { error: advErr.message }); }
      }

      // ★ BARRIER 9: Model Router — update routing stats with verification signal
      try {
        // Reuse LLM-decided problem type (fallback to regex only if not set)
        problemType = (strategyConfig && strategyConfig.problemType) || detectProblemType(dslInstance || userMessage);
        routedModelId = (strategyConfig && strategyConfig.routedModel) || 'deepseek-v4-flash';
        recordRoute(problemType, routedModelId, verification);
      } catch(rtErr) { logger.warn('Route record failed', { error: rtErr.message }); }

      // ★ BARRIER 1: Data Flywheel — record verification result
      try {
        recordVerification(userMessage, finalResult, verification, routedModelId);
        // Record hallucinations if any
        if (verification.hardVetoes) {
          var untrusted = [];
          for (var vi = 0; vi < (verification.hardVetoes || []).length; vi++) {
            if (!verification.hardVetoes[vi].passed) untrusted.push({ value: 0, context: verification.hardVetoes[vi].detail });
          }
          if (untrusted.length > 0) recordHallucination(userMessage, finalResult, untrusted, []);
        }
        // Record DPO pair if verification found a quality gap
        if (!verification.passed && verification.finalScore < 60) {
          var directResult = await directSolve(userMessage, onExec);
          if (directResult.success && directResult.result) {
            recordDPOPair(userMessage, directResult.result, finalResult, { good: 85, bad: verification.finalScore, model: routedModelId, type: problemType });
          }
        }
      } catch(fwErr) { logger.warn('Flywheel record failed', { error: fwErr.message }); }

      // ★ BARRIER 5: Skill Graph — record successful workflow path
      try {
        var pathSteps = [];
        for (var ti = 0; ti < (allToolCalls || []).length; ti++) {
          var tcName = (allToolCalls && allToolCalls[ti] && allToolCalls[ti].function && allToolCalls[ti].function.name) || 'unknown';
          var tcArgs = {};
          try { tcArgs = JSON.parse((allToolCalls && allToolCalls[ti] && allToolCalls[ti].function && allToolCalls[ti].function.arguments) || '{}'); } catch(e) {}
          pathSteps.push({ skill: tcName, params: tcArgs, outputs: { success: verification.passed } });
        }
        if (pathSteps.length > 0) recordPath(userMessage, pathSteps, { problem_type: problemType, model: routedModelId, score: verification.finalScore, passed: verification.passed });
      } catch(sgErr) { logger.warn('Skill graph record failed', { error: sgErr.message }); }

      if (verification.passed) {
        logger.info('Verified OK', { score: verification.finalScore, verdict: verification.verdict, advPassed: advResult ? advResult.passed : 'n/a' });
        bestResponse = bestResponse + '\n\n[Verified: ' + verification.verdict + ', score ' + verification.finalScore + (advResult && !advResult.passed ? ', ⚠️adv' : '') + ']';
      } else {
        logger.warn('Verified FAIL', { score: verification.finalScore, reason: verification.reason });
        const dr = await directSolve(userMessage, onExec);
        if (dr.success && dr.result) {
          bestResponse = dr.result + '\n\n[Verified: fell back to direct solver]';
        } else {
          bestResponse = bestResponse + '\n\n[Verified: ' + verification.verdict + ']';
        }
      }
    } catch(e) {
      logger.warn('Verification engine error', { error: e.message });
    }
  }

  // ── P1: Final quality check ──
  if (bestResponse && bestResponse.length > 50) {
    var finalQC = await qualityCheck(userMessage, messages, bestResponse, '', apiKey);
    if (finalQC.suggestion) bestResponse += '\n\n' + finalQC.suggestion;
  }

  if (bestResponse) return bestResponse;
  return 'Polaris engine could not solve this problem. Please provide more details.';
}

/** ── Map skill name to best starting agent ── */
function mapSkillToAgent(skillName) {
  var map = { '求解模式': 'solver', 'solve': 'solver', '分析模式': 'researcher', 'analyze': 'researcher', '实验模式': 'researcher', 'experiment': 'researcher', '讨论模式': 'researcher', 'discuss': 'researcher', '对话模式': 'chat', 'chat': 'chat' };
  return map[skillName] || 'researcher';
}

/** ── P2: Runtime Handoff — decide if agent should switch based on output ── */
function tryHandoff(currentId, userMessage, content) {
  const agent = getAgentById(currentId);
  if (!agent.handoffs || !agent.handoffs.length) return null;
  // If content mentions verification/check → handoff to verifier
  if (/验证|检查|verify|check|confirm|VALIDATE|PASS|FAIL/i.test(content)) {
    if (agent.handoffs.includes('verifier')) return 'verifier';
  }
  // If content is dense numerical output → handoff to explainer
  if (/目标值|最优解|objective|optimal|solution/i.test(content)) {
    if (agent.handoffs.includes('explainer')) return 'explainer';
  }
  // If content mentions need more research → handoff to researcher
  if (/需要更多|进一步研究|literature|文献|参考/i.test(content)) {
    if (agent.handoffs.includes('researcher')) return 'researcher';
  }
  return null;
}

/** ── P2: Check handoff after tool execution ── */
function shouldHandoffAfterTools(currentId, toolCalls, response) {
  const agent = getAgentById(currentId);
  if (!agent.handoffs || !agent.handoffs.length) return null;
  for (const tc of toolCalls) {
    const name = tc.function?.name || '';
    // After solving → handoff to verifier if available
    if ((name === 'polaris_opt' || name === 'polaris_model') && agent.handoffs.includes('verifier')) return 'verifier';
    // After analyze → handoff to solver if available
    if (name === 'polaris_analyze' && agent.handoffs.includes('solver')) return 'solver';
  }
  return null;
}

/** ── P1: Quality Check — review output, suggest improvements ── */
async function qualityCheck(userMessage, messages, bestResponse, latestContent, apiKey) {
  try {
    var finalText = bestResponse || latestContent || '';
    if (finalText.length < 50) return { needsMore: false };
    var qcPrompt = '你是一个质量审核员。审阅以下对用户问题的回答。只输出一个 JSON：{"needsMore":true/false,"feedback":"如果 needsMore 为 true，写一条具体的改进指令","suggestion":"一句话补充建议（可选）"}\n\n用户问题：' + userMessage.slice(0, 500) + '\n\n回答摘要：' + finalText.slice(0, 1500);
    const qcResp = await callDeepSeek(
      [{ role: 'system', content: '你是一个质量审核员。只输出 JSON。' }, { role: 'user', content: qcPrompt }],
      [], apiKey, 0.1, 512);
    var json = qcResp.choices?.[0]?.message?.content || '';
    var match = json.match(/\{[\s\S]*\}/);
    if (match) {
      var parsed = JSON.parse(match[0]);
      return { needsMore: !!parsed.needsMore, feedback: parsed.feedback || '', suggestion: parsed.suggestion || '' };
    }
  } catch {}
  return { needsMore: false };
}

/* ══════════════════════════════════════════════════════════
   CORE: executeQuery
   ══════════════════════════════════════════════════════════ */

var _ghToken = '';
var _gitNotify = null; // Callback to notify renderer of git operations

async function executeQuery(text, strategy, systemPrompt, images, onStreamChunk, apiKeys = {}) {
  const startTime = Date.now();
  const apiKey = apiKeys.deepseek || apiKeys.anthropic || getApiKey();
  _ghToken = apiKeys.github || '';
  _gitNotify = apiKeys.onGitOp || null;
  const tid = logger.newTraceId();
  logger.info('Request received', { tid, text: text.slice(0, 80) });

  const onExec = apiKeys.onExec || null;
  const onTodo = apiKeys.onTodo || null;

  try {
    // Strategy → token/temperature mapping
    var strategyConfig = { best_quality: { maxTokens: 4096, temperature: 0.3 }, cost_optimized: { maxTokens: 1024, temperature: 0.2 }, ensemble: { maxTokens: 8192, temperature: 0.5 } };
    var stratCfg = strategyConfig[strategy] || strategyConfig.best_quality;
    stratCfg.language = apiKeys.language || 'zh-CN'; // ★ Thread language through

    // ★ BARRIER 9: Model Router — LLM decides intent + problem type + local suitability
    var routingDecision = { intent: 'discuss', problem_type: 'custom', local_ok: false };
    try {
      var { classifyForRouting } = require('./intent');
      routingDecision = await classifyForRouting(text);
    } catch (e) { logger.warn('Routing classifier failed', { error: e.message }); }
    var problemType = routingDecision.problem_type || 'custom';
    var routed = routeModel(problemType, strategy, routingDecision.local_ok);
    stratCfg.routedModel = routed.id;
    stratCfg.routedScore = routed.score;
    stratCfg.problemType = problemType;
    stratCfg.intent = routingDecision.intent;
    stratCfg.localOk = routingDecision.local_ok;
    if (onExec) onExec({ tool: 'model_router', status: 'running', detail: 'Intent: ' + routingDecision.intent + ' | type: ' + problemType + ' | local_ok: ' + routingDecision.local_ok + ' → ' + routed.id + ' (score ' + routed.score + ')' });

    // ── ★ Workflow planning: detect multi-step goals ──
    var needsPlan = /(?:clone|克隆).*(?:fix|修复|code|代码|write|commit|push|pr|pull request|review|审查|experiment|实验).*|(?:analyze|分析).*(?:solve|求解).*(?:push|commit|pr)/i.test(text);
    if (needsPlan && onTodo) {
      try {
        var plan = await planSteps(text, apiKey);
        var planSteps_ = (plan.steps || []).map(function(s, i) {
          return { id: 'step_' + i, label: (SKILLS[s.skill] ? SKILLS[s.skill].name : s.skill), skill: s.skill, status: 'pending', params: s.params, category: SKILLS[s.skill] ? SKILLS[s.skill].category : 'agent' };
        });
        onTodo({ type: 'plan', steps: planSteps_ });
      } catch {}
    }

    const content = await runAgentLoop(text, apiKey, onExec, onTodo, onStreamChunk, stratCfg);
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

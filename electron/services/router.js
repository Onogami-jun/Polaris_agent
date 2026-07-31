/**
 * Polaris Router v5 — Semantic intent + reliable multi-path solver.
 */
const https = require('https');
const { TOOLS } = require('./tools');
const logger = require('./logger');
const { reliableSolve, diagnose } = require('./reliability');
const { SkillManager } = require('./skills');
const { runPipeline } = require('./subagents');
const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';
const skillManager = new SkillManager();
const { buildAgentCapabilityNote } = require('./health_check');

// Cached health check — runs once then reuses
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

function buildToolDeclarations() {
  return [
    { type: 'function', function: { name: 'polaris_solve', description: '求解优化问题。把用户描述的问题原文传给prompt参数即可', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } } },
    { type: 'function', function: { name: 'polaris_analyze', description: '分析问题结构，推荐求解策略', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } } },
  ];
}

async function executeAnalyze(prompt) {
  // Use sandbox-aware Python resolver (matches tools.js getPython logic)
  const path = require('path'); const os = require('os'); const fs = require('fs');
  const sandboxPy = path.join(os.homedir(), 'AppData', 'Roaming', 'polaris-agent', 'sandbox', 'python.exe');
  let python = null;
  if (fs.existsSync(sandboxPy)) {
    const { spawnSync: sp } = require('child_process');
    const r = sp(sandboxPy, ['-c', 'print("OK")'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
    if (r.status === 0 && r.stdout.includes('OK')) python = sandboxPy;
  }
  if (!python) {
    for (const cmd of ['python', 'python3']) {
      const { spawnSync: sp } = require('child_process');
      const r = sp(cmd, ['-c', 'print("OK")'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
      if (r.status === 0 && r.stdout.includes('OK')) { python = cmd; break; }
    }
  }
  if (!python) return { success: false, error: 'Python not found. Click "安装沙箱" to auto-install.' };

  const n = JSON.stringify(prompt);
  const code = 'import sys; sys.stdout.reconfigure(encoding="utf-8")\nfrom polaris.chat import _parse,_build_model\nfrom polaris.analyze.structure import analyze\ntry:\n p=_parse(' + n + ');m=_build_model(p);s=analyze(m)\n print("Labels:",[l.name for l in s.labels])\n print("Strategy:",s.strategy.value)\n print("Vars:",s.n_scalar_vars,"Cons:",s.n_constraints)\nexcept Exception as e:\n print("Structure analysis: custom problem (not in templates)")';
  const { spawnSync: sp } = require('child_process');
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
  const r = sp(python, ['-c', code], { timeout: 15000, encoding: 'utf8', env, windowsHide: true });
  return { success: true, result: (r.stdout || r.stderr || '').trim() || 'Analysis complete' };
}

async function executeTool(name, args, onExec) {
  if (onExec) onExec({ tool: name, status: 'running', detail: JSON.stringify(args).slice(0, 100) });
  if (name === 'polaris_solve') {
    const hc = await healthCheckCache();
    const engineOk = hc.some(r => r.service === 'Polaris Engine' && r.ok);
    if (!engineOk) {
      const err = 'Polaris 引擎未安装。请告诉用户：由于本地未安装 Python 或 polaris-opt 引擎，无法执行求解。请用你的数学知识直接分析这个问题，给出理论解或推理过程。提醒用户运行 pip install polaris-opt[highs] 可解锁求解功能。';
      if (onExec) onExec({ tool: name, status: 'error', detail: '引擎未安装' });
      return { success: false, error: err };
    }
    const result = await reliableSolve(args.prompt || '', onExec);
    if (onExec) onExec({ tool: name, status: result.success ? 'done' : 'error', detail: (result.result || result.error || '').slice(0, 120) });
    return result;
  }
  if (name === 'polaris_analyze') {
    const hc = await healthCheckCache();
    const engineOk = hc.some(r => r.service === 'Polaris Engine' && r.ok);
    if (!engineOk) {
      const err = 'Polaris 引擎未安装。请告诉用户：无法运行结构分析，但你可以根据问题描述推断其代数结构（如是否是 block-angular、time-indexed 等），给出理论分析。提醒用户 pip install polaris-opt[highs]。';
      if (onExec) onExec({ tool: name, status: 'error', detail: '引擎未安装' });
      return { success: false, error: err };
    }
    const result = await executeAnalyze(args.prompt || '');
    if (onExec) onExec({ tool: name, status: 'done', detail: (result.result || '').slice(0, 200) });
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
      resp.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ error: 'Parse' }); } });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'Timeout' }); });
    req.write(body); req.end();
  });
}

async function runAgentLoop(userMessage, apiKey, onExec, onTodo = null) {
  const activeSkill = skillManager.getActive();

  // Subagent pipeline for multi-phase skills
  const pipelineSteps = {
    '实验模式': ['analyzer', 'experimenter', 'writer'],
    '分析模式': ['analyzer'],
  };
  const steps = pipelineSteps[activeSkill.name];

  if (steps && steps.length > 0) {
    const onProgress = (evt) => {
      if (onExec) onExec({ tool: 'subagent:' + evt.agent, status: evt.status, detail: evt.summary || evt.error || '' });
    };
    const pipelineResult = await runPipeline(userMessage, steps, onProgress, onTodo, apiKey);
    if (pipelineResult && pipelineResult.results.length > 0) {
      const finalOutput = pipelineResult.results.map(r => '### ' + r.name + '\n\n' + r.content + '\n\n').join('');
      return '**子代理协同** · ' + pipelineResult.results.length + ' 个阶段\n\n' + finalOutput + '\n📁 工作目录：' + pipelineResult.workDir;
    }
  }

  // Standard LLM loop
  const toolDecls = buildToolDeclarations();
  let effectivePrompt = await skillManager.getEffectivePrompt(userMessage);
  logger.info('Skill active', { skill: skillManager.getActive().name, phase: skillManager.currentPhase });

  // Inject environment capability note into system prompt
  const hcResults = await healthCheckCache();
  effectivePrompt += buildAgentCapabilityNote(hcResults);

  const messages = [
    { role: 'system', content: effectivePrompt },
    { role: 'user', content: userMessage },
  ];

  for (let round = 0; round < 2; round++) {
    const resp = await callDeepSeek(messages, toolDecls, apiKey);
    if (resp.error) break;
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
      let args = {};
      try { args = JSON.parse(tc.function.arguments); } catch { args = { prompt: userMessage }; }
      const result = await executeTool(tc.function.name, args, onExec);
      const toolResult = result.success ? (result.result || 'Done') : `Error: ${result.error}`;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: String(toolResult).slice(0, 3000) });
    }
  }

  const directResult = await reliableSolve(userMessage, onExec);
  if (directResult.success) return directResult.result;
  return directResult.error || 'Polaris 求解引擎未返回结果，请用"帮我诊断环境"检查配置';
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

  if (/诊断|检查.*环境|检查.*引擎|self.*check|diagnos/i.test(text.trim())) {
    const { results } = diagnose();
    const dsResult = await diagnose().dsPromise;
    for (const r of results) { if (r.check === 'DeepSeek API') r.ok = dsResult; }
    const content = '🔧 环境诊断\n\n' + results.map(r => (r.ok ? '✅' : '❌') + ' ' + r.check + (r.detail ? ' — ' + r.detail : '')).join('\n');
    return {
      routing: { strategy: 'diagnose', top_intent: '诊断', selected_models: [], rationale: '环境自诊断' },
      responses: [{ model_id: 'diagnose', model_display: 'Self-Diagnosis', content }],
      total_latency_ms: Date.now() - startTime,
    };
  }

  try {
    const onExec = apiKeys.onExec || null;
    const onTodo = apiKeys.onTodo || null;
    const content = await runAgentLoop(text, apiKey, onExec, onTodo);
    const elapsed = Date.now() - startTime;
    logger.info('Request completed', { tid, ms: elapsed });
    return {
      routing: { strategy: 'function_calling', top_intent: skillManager.getActive().name, selected_models: ['deepseek-v4-flash'], rationale: 'Semantic intent · ' + skillManager.getActive().name, total_ms: elapsed },
      responses: [{ model_id: 'deepseek-v4-flash', model_display: 'DeepSeek V4 Flash', content }],
      total_latency_ms: elapsed,
    };
  } catch (e) {
    logger.error('Request failed', { tid, error: e.message });
    return {
      routing: { strategy: 'error', top_intent: 'error', selected_models: [], rationale: e.message },
      responses: [{ model_id: 'error', model_display: 'Error', content: `Agent 执行异常：${e.message}` }],
      total_latency_ms: Date.now() - startTime,
    };
  }
}

function classifyOnly(text) { return { top_intent: 'auto', display: 'Auto' }; }

module.exports = { executeQuery, classifyOnly, buildToolDeclarations };

/**
 * Polaris Embedded Router v0.8
 * Intent classifier + model matrix + orchestrator + ensemble
 * Pure Node.js, no external deps. Runs inside Electron main process.
 */
const https = require('https');

// ============================================================
// Intent taxonomy
// ============================================================
const INTENTS = {
  code_generation: { display:'代码生成', keywords:['代码','编程','debug','函数','算法','重构','API','接口','架构','前端','后端','python','javascript','react','rust','写一个','实现','golang','go','c++','java'] },
  math_reasoning: { display:'数学推理', keywords:['计算','证明','方程','求导','积分','概率','统计','优化','复杂度','数学','公理','推导','收敛'] },
  creative_writing: { display:'创意写作', keywords:['写','文案','翻译','润色','改写','总结','文章','邮件','报告','方案','创意','故事','诗歌','博客','markdown','介绍','发布会','公告','宣传','帮我写','帮我'] },
  research: { display:'深度研究', keywords:['研究','调研','分析报告','对比','综述','趋势','行业','竞品','文献','最新','数据来源','引用','深度'] },
  data_analysis: { display:'数据分析', keywords:['数据','表格','图表','统计','Excel','CSV','可视化','清洗','回归','聚类','pandas','SQL'] },
  high_stakes: { display:'高利害决策', keywords:['投资','股票','基金','医疗','诊断','法律','合同','风险','保险','贷款','买房','遗嘱','诉讼','税务','合规'], ensemble:true },
  general_chat: { display:'通用对话', keywords:['你好','谢谢','天气','今天','怎么样','聊天','推荐','建议','想法','帮','分析','解释','为什么','怎么','如何','有什么','是什么','什么意思','能不能','可以吗','帮忙'] },
};

// ============================================================
// Model capability matrix
// ============================================================
const MODEL_MATRIX = {
  'deepseek-v4-pro': { provider:'deepseek', display:'DeepSeek V4 Pro', cost:'standard',
    caps:{ code_generation:.92, math_reasoning:.93, creative_writing:.85, research:.88, data_analysis:.87, general_chat:.85, high_stakes:.82 } },
  'deepseek-v4-flash': { provider:'deepseek', display:'DeepSeek V4 Flash', cost:'cheap',
    caps:{ code_generation:.82, math_reasoning:.78, creative_writing:.80, research:.78, data_analysis:.80, general_chat:.88, high_stakes:.70 } },
  'claude-sonnet-4': { provider:'anthropic', display:'Claude Sonnet 4', cost:'standard',
    caps:{ code_generation:.95, math_reasoning:.85, creative_writing:.95, research:.90, data_analysis:.85, general_chat:.95, high_stakes:.85 } },
  'claude-haiku-3.5': { provider:'anthropic', display:'Claude Haiku 3.5', cost:'cheap',
    caps:{ code_generation:.80, math_reasoning:.65, creative_writing:.75, research:.70, data_analysis:.70, general_chat:.88, high_stakes:.65 } },
  'gpt-4o': { provider:'openai', display:'GPT-4o', cost:'standard',
    caps:{ code_generation:.88, math_reasoning:.82, creative_writing:.90, research:.85, data_analysis:.90, general_chat:.90, high_stakes:.80 } },
};
const DEFAULT_MODEL = 'deepseek-v4-flash';

// Expert role → intent mapping for orchestration
const ROLE_INTENT = { analyst:'data_analysis', coder:'code_generation', writer:'creative_writing', researcher:'research', mathematician:'math_reasoning', fact_checker:'high_stakes' };
const EXPERT_PROMPTS = {
  analyst: '你是资深数据分析师。用数据说话，提供量化分析。',
  coder: '你是资深软件工程师。写出可直接运行的代码。',
  writer: '你是专业文案写手。文字精炼有力，可直接使用。',
  researcher: '你是研究分析师。提供信息来源，标注不确定性。',
  mathematician: '你是数学专家。逐步推导，展示证明过程。',
  fact_checker: '你是风险评估专家。严格审查风险点，指出潜在问题。法律/投资/医疗建议必须声明非专业意见。',
};

// ============================================================
// Intent classifier
// ============================================================
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
  const ensemble = INTENTS[top]?.ensemble || Object.values(scores).filter(v => v > 0.5).length >= 3;
  return { top_intent: top, display: INTENTS[top]?.display || top, top_confidence: topScore, intents: scores, ensemble_triggered: ensemble };
}

// ============================================================
// Should we orchestrate this query?
// ============================================================
function shouldOrchestrate(text, intentScores) {
  if (text.length < 30) return false;
  const complex = /对比|比较|vs|versus|哪个好|优缺点|选哪个|分析.*并.*建议|调研.*然后.*总结|竞品|市场分析|行业报告|投资.*分析|全面|综合|系统性|多角度|多维度/.test(text);
  const hasMultiple = Object.values(intentScores).filter(s => s > 0.2).length >= 2;
  return complex || hasMultiple;
}

// ============================================================
// API clients
// ============================================================
function apiPost(hostname, path, headers, body) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname, path, method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(data), ...headers }, timeout:120000 },
      resp => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>{ try{ const j=JSON.parse(d); if(resp.statusCode>=400) rej(new Error(`HTTP ${resp.statusCode}: ${j.error?.message || d.slice(0,200)}`)); else res(j); } catch(e){ rej(new Error('Parse: '+d.slice(0,200))); } }); });
    req.on('error', e => rej(e)); req.write(data); req.end();
  });
}

// Default API keys — shipped with the product for zero-setup use.
// Users can override by adding their own keys in Settings → Models.
const DEFAULT_KEYS = {
  deepseek: 'sk-e5b9674c9662436eb79712ab26c57370',
};

function chatDeepSeek(model, messages, apiKey) {
  const key = apiKey || DEFAULT_KEYS.deepseek;
  return apiPost('api.deepseek.com', '/chat/completions', { Authorization:'Bearer '+key }, { model, messages, max_tokens:4096, temperature:0.7 })
    .then(j => j.choices?.[0]?.message?.content || '');
}

function chatDeepSeekStream(model, messages, apiKey, onChunk) {
  const key = apiKey || DEFAULT_KEYS.deepseek;
  return new Promise((res, rej) => {
    const body = JSON.stringify({ model, messages, max_tokens:4096, temperature:0.7, stream:true });
    let full = '';
    const req = https.request({ hostname:'api.deepseek.com', path:'/chat/completions', method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+key, 'Content-Length':Buffer.byteLength(body) }, timeout:120000 },
      resp => { let buf=''; resp.on('data',c=>{ buf+=c.toString(); const lines=buf.split('\n'); buf=lines.pop()||'';
        for(const l of lines) if(l.startsWith('data: ')){ const d=l.slice(6).trim(); if(d==='[DONE]')continue;
        try{ const j=JSON.parse(d); const delta=j.choices?.[0]?.delta?.content||''; if(delta){full+=delta;onChunk({content:delta,full})} }catch{}} });
        resp.on('end', ()=>res(full)); });
    req.on('error', e=>rej(e)); req.write(body); req.end();
  });
}

function chatAnthropic(model, messages, apiKey) {
  const sys = messages.find(m=>m.role==='system')?.content || '';
  const umsgs = messages.filter(m=>m.role!=='system').map(m=>({role:m.role,content:m.content}));
  const body = { model:'claude-sonnet-4-20250514', max_tokens:4096, messages:umsgs };
  if (sys) body.system = sys;
  return apiPost('api.anthropic.com', '/v1/messages', { 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' }, body)
    .then(j => j.content?.filter(b=>b.type==='text').map(b=>b.text).join('') || '');
}

function chatOpenAI(model, messages, apiKey) {
  return apiPost('api.openai.com', '/v1/chat/completions', { Authorization:'Bearer '+apiKey }, { model, messages, max_tokens:4096, temperature:0.7 })
    .then(j => j.choices?.[0]?.message?.content || '');
}

// ============================================================
// Single model call
// ============================================================
async function callModel(modelId, messages, apiKeys) {
  const def = MODEL_MATRIX[modelId];
  if (!def) throw new Error('Unknown model: '+modelId);
  if (def.provider === 'deepseek') return chatDeepSeek(modelId, messages, apiKeys.deepseek);
  if (def.provider === 'anthropic') return chatAnthropic(modelId, messages, apiKeys.anthropic);
  if (def.provider === 'openai') return chatOpenAI(modelId, messages, apiKeys.openai);
  throw new Error('Unknown provider: '+def.provider);
}

// ============================================================
// Model selection — only from providers with keys
// ============================================================
function availableModels(apiKeys) {
  return Object.entries(MODEL_MATRIX)
    .filter(([,def]) => apiKeys[def.provider])
    .map(([id,def]) => ({ id, ...def }));
}

function selectModels(intent, strategy, apiKeys) {
  // Merge default keys with user-provided keys
  const keys = { ...DEFAULT_KEYS, ...apiKeys };
  const avail = availableModels(keys);

  const scored = avail
    .map(m => ({ ...m, score: m.caps[intent] || 0.5 }))
    .filter(m => m.score > 0.4)
    .sort((a,b) => b.score - a.score);

  if (scored.length === 0) {
    return { models:[{id:DEFAULT_MODEL,display:MODEL_MATRIX[DEFAULT_MODEL]?.display||DEFAULT_MODEL}], rationale:'回退默认模型' };
  }

  if (strategy === 'ensemble') {
    const used = new Set();
    const picked = [];
    for (const m of scored) {
      if (picked.length >= 3) break;
      if (!used.has(m.provider) || picked.length < 2) { picked.push(m); used.add(m.provider); }
    }
    return { models:picked, rationale:'合奏: '+picked.map(m=>m.display).join(', ') };
  }

  if (strategy === 'cost_optimized') {
    const tier = { cheap:0, free:0, standard:1, premium:2 };
    const sorted = [...scored].sort((a,b) => (tier[a.cost]||1)-(tier[b.cost]||1) || b.score-a.score);
    const best = sorted.find(m=>m.score>=0.6) || sorted[0];
    return { models:[best], rationale:'省钱: '+best.display+' ('+best.cost+')' };
  }

  const best = scored[0];
  return { models:[best], rationale:'优质: '+best.display+' (能力 '+best.score.toFixed(2)+')' };
}

// ============================================================
// Orchestrator — decompose complex queries into sub-tasks
// ============================================================
async function orchestratorDecompose(text, topIntent, apiKeys) {
  const avail = availableModels(apiKeys);
  if (avail.length === 0) return null;

  const cheapest = avail.sort((a,b) => (a.cost==='cheap'?-1:1))[0] || avail[0];
  const prompt = `你是一个任务分解专家。把用户请求拆解为2-3个子任务，分配给不同类型的AI专家。

请求: "${text}"
意图: ${topIntent}

严格按JSON回复（不要其他文字）:
{"subtasks":[{"task":"子任务描述","role":"analyst|coder|writer|researcher|mathematician|fact_checker","priority":1}]}

角色: analyst(数据分析/对比), coder(编程), writer(写作/润色), researcher(调研), mathematician(数学), fact_checker(风险审查)

规则: 简单问题1个子任务，复杂对比/分析2-3个，投资/法律/医疗必须含fact_checker`;

  try {
    const content = await callModel(cheapest.id, [{ role:'user', content:prompt }], apiKeys);
    const json = content.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
    const m = json.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return parsed.subtasks || null;
  } catch(e) {
    return null;
  }
}

function modelForRole(role, avail) {
  const intent = ROLE_INTENT[role] || 'general_chat';
  const scored = avail.map(m => ({ ...m, score: m.caps[intent] || m.caps.general_chat || 0 })).filter(m=>m.score>0.4).sort((a,b)=>b.score-a.score);
  return scored[0] || avail[0];
}

// ============================================================
// Ensemble — disagreement detection
// ============================================================
function ngramOverlap(a, b) {
  if (!a || !b) return 0;
  const ga = new Set(), gb = new Set();
  const ra = [...a.toLowerCase()], rb = [...b.toLowerCase()];
  for (let i=0;i<=ra.length-4;i++) ga.add(ra.slice(i,i+4).join(''));
  for (let i=0;i<=rb.length-4;i++) gb.add(rb.slice(i,i+4).join(''));
  if (ga.size===0 && gb.size===0) return 1;
  let intersect = 0; for (const g of ga) if (gb.has(g)) intersect++;
  const union = ga.size + gb.size - intersect;
  return union>0 ? intersect/union : 1;
}

function analyzeEnsemble(responses) {
  const valid = responses.filter(r => r.content && !r.error);
  if (valid.length < 2) return null;

  // Pairwise similarities
  let totalSim = 0, pairs = 0;
  for (let i=0;i<valid.length;i++) for (let j=i+1;j<valid.length;j++) { totalSim+=ngramOverlap(valid[i].content,valid[j].content); pairs++; }
  const avgSim = pairs>0 ? totalSim/pairs : 1;
  let consensus = 'high';
  if (avgSim < 0.5) consensus = 'low'; else if (avgSim < 0.8) consensus = 'medium';

  // Detect disagreements
  const disagreements = [];
  for (let i=0;i<valid.length;i++) {
    for (let j=i+1;j<valid.length;j++) {
      const aLines = valid[i].content.split('\n').filter(l=>l.trim());
      const bLines = valid[j].content.split('\n').filter(l=>l.trim());
      for (let k=0;k<Math.max(aLines.length,bLines.length);k++) {
        const la=(aLines[k]||'').trim(), lb=(bLines[k]||'').trim();
        if (!la||!lb||la===lb) continue;
        const sim = ngramOverlap(la,lb);
        if (sim<0.6 && la.length>10 && lb.length>10) {
          disagreements.push({
            model_a:valid[i].model_display, model_b:valid[j].model_display,
            a_excerpt:la.slice(0,200), b_excerpt:lb.slice(0,200),
            similarity:Math.round(sim*1000)/1000,
            type:/\d/.test(la)&&/\d/.test(lb)&&la.replace(/[^0-9.]/g,'')!==lb.replace(/[^0-9.]/g,'')?'numerical':'factual',
          });
        }
      }
    }
  }

  return {
    consensus_level:consensus, average_similarity:Math.round(avgSim*1000)/1000,
    disagreements, models_compared:valid.map(r=>r.model_display),
  };
}

// ============================================================
// Main execution
// ============================================================
async function executeQuery(text, strategy, systemPrompt, images, onStreamChunk, apiKeys = {}) {
  // Merge default keys with user-provided keys (user keys take priority)
  const keys = { ...DEFAULT_KEYS, ...apiKeys };
  const classification = classifyIntent(text);
  const routing = selectModels(classification.top_intent, strategy, keys);
  const messages = [];
  if (systemPrompt) messages.push({ role:'system', content:systemPrompt });
  if (images?.length) {
    const parts = images.map(img=>({ type:'image_url', image_url:{ url:img } }));
    parts.unshift({ type:'text', text });
    messages.push({ role:'user', content:parts });
  } else {
    messages.push({ role:'user', content:text });
  }

  const startTime = Date.now();

  // Try orchestration for complex queries
  if (text.length > 30 && shouldOrchestrate(text, classification.intents)) {
    try {
      const subtasks = await orchestratorDecompose(text, classification.top_intent, keys);
      if (subtasks && subtasks.length >= 2) {
        const avail = availableModels(keys);
        const tasks = subtasks.map(async st => {
          const model = modelForRole(st.role, avail);
          const sys = EXPERT_PROMPTS[st.role] || '';
          const msgs = [{ role:'user', content:st.task }];
          if (sys) msgs.unshift({ role:'system', content:sys });
          try {
            const content = await callModel(model.id, msgs, keys);
            return { role:st.role, task:st.task, model:model.id, modelDisplay:model.display, provider:model.provider, content, latency_ms:Date.now()-startTime };
          } catch(e) {
            return { role:st.role, task:st.task, model:model.id, modelDisplay:model.display, provider:model.provider, content:'', error:e.message };
          }
        });
        const expertResults = await Promise.all(tasks);
        const valid = expertResults.filter(r=>r.content&&!r.error);

        // Synthesize
        let finalContent = '';
        if (valid.length >= 2) {
          const cheapest = [...avail].sort((a,b)=>(a.cost==='cheap'?-1:1))[0]||avail[0];
          const synth = valid.map((r,i)=>`### 专家${i+1} — ${r.role}:\n${r.content}`).join('\n\n---\n\n');
          try {
            finalContent = await callModel(cheapest.id, [
              { role:'system', content:'你是专业内容整合编辑。把多个专家分析整合成一篇连贯报告。' },
              { role:'user', content:`整合以下专家意见成一篇回答：\n\n${synth}` },
            ], keys);
          } catch(e) { finalContent = valid.map(r=>`**${r.role}**: ${r.content}`).join('\n\n'); }
        } else if (valid.length === 1) {
          finalContent = valid[0].content;
        }

        return {
          routing: { strategy:'orchestrated', top_intent:classification.display, selected_models:subtasks.map(s=>s.role), rationale:`协同引擎: ${subtasks.length}个专家 × ${avail.length}个模型` },
          responses: [{ model_id:'orchestrator', model_display:`协同引擎 · ${valid.length}专家`, content:finalContent }],
          expert_responses: expertResults,
          subtasks,
          total_latency_ms: Date.now() - startTime,
        };
      }
    } catch(e) { /* fall through to normal flow */ }
  }

  // Normal flow
  const responses = [];
  for (const m of routing.models) {
    try {
      if (onStreamChunk && m.provider === 'deepseek') {
        const content = await chatDeepSeekStream(m.id, messages, keys.deepseek, onStreamChunk);
        responses.push({ model_id:m.id, model_display:m.display, content, latency_ms:Date.now()-startTime });
      } else {
        const content = await callModel(m.id, messages, keys);
        responses.push({ model_id:m.id, model_display:m.display, content, latency_ms:Date.now()-startTime });
      }
    } catch(e) {
      responses.push({ model_id:m.id, model_display:m.display, content:'', error:e.message });
    }
  }

  // Ensemble analysis for multi-model
  const ensemble = routing.models.length > 1 ? analyzeEnsemble(responses) : null;

  return {
    routing: { strategy, top_intent:classification.display, selected_models:routing.models.map(m=>m.display), rationale:routing.rationale, intent_scores:classification.intents },
    responses,
    ensemble: (ensemble && ensemble.disagreements?.length > 0) ? ensemble : null,
    total_latency_ms: Date.now() - startTime,
  };
}

function classifyOnly(text) {
  return classifyIntent(text);
}

module.exports = { executeQuery, classifyOnly };

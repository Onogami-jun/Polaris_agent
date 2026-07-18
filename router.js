/**
 * Polaris Embedded Router Engine v0.4
 * Pure Node.js — embedded in Electron main process.
 * Intent classifier + model selector + API gateway.
 */
const https = require('https');

const INTENTS = {
  code_generation:    { display: '代码生成', keywords: ['代码','编程','debug','函数','算法','重构','API','接口','架构','前端','后端','python','javascript','react','rust','写一个','实现','golang','go','c++','java'], ensemble: false },
  math_reasoning:     { display: '数学推理', keywords: ['计算','证明','方程','求导','积分','概率','统计','优化','复杂度','数学','公理','推导','收敛'], ensemble: false },
  creative_writing:   { display: '创意写作', keywords: ['写','文案','翻译','润色','改写','总结','文章','邮件','报告','方案','创意','故事','诗歌','博客','markdown','介绍','发布会','公告','宣传','帮我写','帮我'], ensemble: false },
  research:           { display: '深度研究', keywords: ['研究','调研','分析报告','对比','综述','趋势','行业','竞品','文献','最新','数据来源','引用','深度'], ensemble: false },
  data_analysis:      { display: '数据分析', keywords: ['数据','表格','图表','统计','Excel','CSV','可视化','清洗','回归','聚类','pandas','SQL'], ensemble: false },
  high_stakes:        { display: '高利害决策', keywords: ['投资','股票','基金','医疗','诊断','法律','合同','风险','保险','贷款','买房','遗嘱','诉讼','税务','合规'], ensemble: true },
  general_chat:       { display: '通用对话', keywords: ['你好','谢谢','天气','今天','怎么样','聊天','推荐','建议','想法','帮','分析','解释','为什么','怎么','如何','有什么','是什么','什么意思','能不能','可以吗','帮忙'], ensemble: false },
};

const MODEL_MATRIX = {
  'deepseek-chat':     { provider: 'deepseek', display: 'DeepSeek V3', cost: 'cheap',    caps: { code_generation:.85, math_reasoning:.82, creative_writing:.80, research:.82, data_analysis:.82, general_chat:.85, high_stakes:.72 } },
  'deepseek-reasoner': { provider: 'deepseek', display: 'DeepSeek R1', cost: 'standard', caps: { code_generation:.90, math_reasoning:.95, creative_writing:.70, research:.82, data_analysis:.80, general_chat:.70, high_stakes:.75 } },
  'claude-sonnet-4':   { provider: 'anthropic', display: 'Claude Sonnet 4', cost: 'standard', caps: { code_generation:.95, math_reasoning:.85, creative_writing:.95, research:.90, data_analysis:.85, general_chat:.95, high_stakes:.85 } },
  'gpt-4o':           { provider: 'openai', display: 'GPT-4o', cost: 'standard', caps: { code_generation:.88, math_reasoning:.82, creative_writing:.90, research:.85, data_analysis:.90, general_chat:.90, high_stakes:.80 } },
};

function classifyIntent(text) {
  const scores = {}; let top = 'general_chat'; let topScore = 0;
  for (const [intent, def] of Object.entries(INTENTS)) {
    let score = 0;
    for (const kw of def.keywords) { if (text.toLowerCase().includes(kw.toLowerCase())) score += 1; }
    scores[intent] = Math.min(score / 3, 1);
    if (scores[intent] > topScore) { topScore = scores[intent]; top = intent; }
  }
  const ensemble = INTENTS[top]?.ensemble || Object.values(scores).filter(s => s > 0.5).length >= 3;
  return { top_intent: top, display: INTENTS[top]?.display || top, top_confidence: topScore, intents: scores, ensemble_triggered: ensemble };
}

function selectModels(intent, strategy) {
  const candidates = Object.entries(MODEL_MATRIX).filter(([,def]) => (def.caps[intent] || 0.5) > 0.5).map(([id,def]) => ({ id, display: def.display, ...def, score: def.caps[intent] || 0.5 })).sort((a,b) => b.score - a.score);
  if (strategy === 'ensemble') { const picked = []; const providers = new Set(); for (const c of candidates) { if (picked.length >= 3) break; if (!providers.has(c.provider) || picked.length < 2) { picked.push(c); providers.add(c.provider); } } return { models: picked, rationale: '多模型协同: ' + picked.map(m=>m.display).join(', ') }; }
  if (strategy === 'cost_optimized') { const cheap = candidates.filter(c => c.cost === 'cheap' && c.score >= 0.7); const best = cheap[0] || candidates[0]; return { models: [best], rationale: '成本优先: ' + best.display }; }
  const best = candidates[0]; return { models: [best], rationale: '最佳质量: ' + best.display };
}

function chatDeepSeek(model, messages, apiKey) {
  const key = apiKey || 'sk-e5b9674c9662436eb79712ab26c57370';
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, messages, max_tokens: 4096, stream: false });
    const req = https.request({ hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) }, timeout: 120000 }, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data).choices?.[0]?.message?.content || ''); } catch(e) { reject(new Error('解析失败')); } }); });
    req.on('error', e => reject(e)); req.write(body); req.end();
  });
}

function chatAnthropic(model, messages, apiKey) {
  const key = apiKey || '';
  return new Promise((resolve, reject) => {
    const sys = messages.find(m => m.role === 'system')?.content || '';
    const umsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    const body = JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4096, system: sys, messages: umsgs });
    const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) }, timeout: 120000 }, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data).content?.[0]?.text || ''); } catch(e) { reject(new Error('解析失败')); } }); });
    req.on('error', e => reject(e)); req.write(body); req.end();
  });
}

function chatOpenAI(model, messages, apiKey) {
  const key = apiKey || '';
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, messages, max_tokens: 4096 });
    const req = https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) }, timeout: 120000 }, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data).choices?.[0]?.message?.content || ''); } catch(e) { reject(new Error('解析失败')); } }); });
    req.on('error', e => reject(e)); req.write(body); req.end();
  });
}

async function callModel(modelId, messages) {
  const def = MODEL_MATRIX[modelId]; if (!def) throw new Error('未知模型: ' + modelId);
  if (def.provider === 'deepseek') return chatDeepSeek(modelId, messages);
  if (def.provider === 'anthropic') return chatAnthropic(modelId, messages);
  if (def.provider === 'openai') return chatOpenAI(modelId, messages);
  throw new Error('未知供应商: ' + def.provider);
}

async function executeQuery(text, strategy, systemPrompt) {
  const classification = classifyIntent(text);
  const routing = selectModels(classification.top_intent, strategy);
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: text });

  const responses = [];
  for (const m of routing.models) {
    try {
      const content = await callModel(m.id, messages);
      responses.push({ model_id: m.id, model_display: m.display, content, latency_ms: 0 });
    } catch (e) {
      responses.push({ model_id: m.id, model_display: m.display, content: '', error: e.message });
    }
  }

  return {
    routing: {
      strategy,
      top_intent: classification.display,
      selected_models: routing.models.map(m => m.display),
      rationale: routing.rationale,
      intent_scores: classification.intents,
    },
    responses,
    total_latency_ms: 0,
  };
}

module.exports = { executeQuery, classifyIntent, MODEL_MATRIX, INTENTS };

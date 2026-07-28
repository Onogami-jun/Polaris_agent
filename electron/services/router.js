/**
 * Polaris Solver Router v3.0 — Simple direct LLM with optimization system prompt.
 */
const https = require('https');
const { TOOLS, ToolExecutor } = require('./tools');
const toolExecutor = new ToolExecutor();
const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';

const SYSTEM_PROMPT = `你是 Polaris，运筹优化科研助手。你的能力：

1. 分析优化问题结构：block-angular、time-indexed、assignment-like 等
2. 推荐求解策略：Benders 分解、Column Generation、Lagrangian 松弛、直接求解
3. 解释最优解：为什么是最优的、约束边界在哪里、对偶信息意味着什么
4. 设计实验方案：对比不同求解器、不同规模、不同参数

## 问题类型

你支持这些优化问题类型（用中文直接描述即可）：

- **背包问题**："3件物品，价值60 100 120，重量10 20 30，容量50"
- **排产调度**："排产3个任务，处理时间1 2 3" 或 "排产5个任务，处理时间2 3 1 4 2，权重1 2 1 1 3"
- **指派问题**："指派4个工人，成本矩阵 10 2 8 7 / 5 12 3 6 / 7 4 9 3 / 8 2 5 1"
- **多背包**："多资源背包，3件物品，2种资源..."
- **集合覆盖**："覆盖问题..."
- **车辆路径(VRP)**："车辆路径，距离矩阵...，需求量...，车载量...，车辆数..."
- **设施选址**："选址问题，候选点数量和客户数量..."

## 回复规则

1. 如果用户描述了一个具体的优化问题，直接告诉他如何用 Polaris 工具求解
2. 如果用户问"为什么""怎么推导""原理是什么"，用学术方式解释
3. 如果用户想跑实验、对比求解器，告诉他可以用 polaris_research 工具
4. 用中文回复，语气专业但友好
5. 回复简洁，每次结尾提出一个下一步建议`;

function callLLM(messages, apiKey) {
  const key = apiKey || DEFAULT_KEY;
  return new Promise((res) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash', messages, max_tokens: 4096, temperature: 0.3,
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, resp => {
      let d = '';
      resp.on('data', c => { d += c.toString(); });
      resp.on('end', () => {
        try {
          const j = JSON.parse(d);
          res(j.choices?.[0]?.message?.content || '抱歉，我现在无法回复。请稍后再试。');
        } catch (e) {
          res('回复解析异常，请重试。');
        }
      });
    });
    req.on('error', () => res('网络连接失败，请检查网络后重试。'));
    req.on('timeout', () => { req.destroy(); res('请求超时，请简化你的问题再试。'); });
    req.write(body); req.end();
  });
}

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

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: text },
  ];

  try {
    const content = await callLLM(messages, apiKey);
    return {
      routing: { strategy: 'direct', top_intent: '对话', selected_models: ['deepseek-v4-flash'], rationale: 'Polaris 优化助手' },
      responses: [{ model_id: 'deepseek-v4-flash', model_display: 'DeepSeek V4 Flash', content }],
      total_latency_ms: Date.now() - startTime,
    };
  } catch (e) {
    return {
      routing: { strategy: 'error', top_intent: 'error', selected_models: [], rationale: e.message },
      responses: [{ model_id: 'error', model_display: 'Error', content: `连接失败：${e.message}。请检查网络后重试。` }],
      total_latency_ms: Date.now() - startTime,
    };
  }
}

function classifyOnly(text) { return { top_intent: 'auto', display: 'Auto' }; }

module.exports = { executeQuery, classifyOnly, toolExecutor };

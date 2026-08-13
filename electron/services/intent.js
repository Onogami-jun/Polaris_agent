/**
 * Polaris Intent Classifier v2 — LLM-driven, zero regex
 *
 * Pattern: single tiny LLM call (8 tokens, ~0.01s) decides routing.
 * Inspired by: Anthropic Router, vLLM semantic-router, MS AutoGen.
 *
 * 5 modes:
 *   discuss   — 讨论方法、设计算法、解释概念、没有具体数据
 *   solve     — 求解具体优化实例（有数字：重量、容量、处理时间等）
 *   analyze   — 分析问题结构、推荐策略、比较方法优劣
 *   experiment — 跑对比实验、批量测试、生成论文表格
 *   chat      — 问候、闲聊、非优化类的通用对话
 */

const https = require('https');
const { getKey } = require('./keymanager');

const CLASSIFY_PROMPT = `你是一个极简路由器。读完用户消息后，只输出一个英文单词。
输出必须是以下之一，不得带标点符号、括号或额外文字：

discuss — 用户在讨论、探讨、设计算法、比较方法，但没有提供具体的优化问题数据（没有数字）。例如："设计一个LBBD算法"、"我们讨论港口泊位问题"、"Benders分解的收敛速度如何提升"、"给我解释column generation原理"

solve — 用户提供了具体优化问题的数据（包含数字参数）。例如："背包容量50，价值60 100 120，重量10 20 30"、"5个工件3台机器处理时间[2,3,1,4,2]"、"指派成本10 2 8 7"

analyze — 用户想分析问题结构、推荐策略、做结构检测。例如："帮我分析这个排产问题的数学结构"、"这个block-angular结构适合用什么分解方法"、"推荐最合适的求解策略"

experiment — 用户想跑批量实验、对比测试、生成性能图。例如："跑个实验对比HiGHS和Benders"、"生成论文用的对比表格"、"benchmark 3个求解器在背包上的表现"

chat — 问候、感谢、简单闲聊、或者非优化类的通用问题。例如："你好"、"谢谢"、"今天天气怎么样"、"介绍一下你自己"

现在请为用户的消息输出一个精确的分类词。`;

/**
 * One-shot LLM call, returns intent label.
 */
async function classifyIntent(userMessage) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: CLASSIFY_PROMPT },
        { role: 'user', content: userMessage.slice(0, 600) },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getKey(),
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 8000,
    }, resp => {
      let d = '';
      resp.on('data', c => d += c.toString());
      resp.on('end', () => {
        try {
          const content = (JSON.parse(d).choices?.[0]?.message?.content || '').trim().toLowerCase();
          // Match first recognized keyword
          const keywords = ['experiment', 'analyze', 'discuss', 'solve', 'chat'];
          for (const kw of keywords) {
            if (content.includes(kw)) return resolve(kw);
          }
          // Default: if no keyword matched, lean on whether there's numerical data
          resolve(/\d+/.test(userMessage) ? 'solve' : 'discuss');
        } catch {
          resolve(/\d+/.test(userMessage) ? 'solve' : 'discuss');
        }
      });
    });

    req.on('error', () => resolve('discuss'));
    req.on('timeout', () => { req.destroy(); resolve('discuss'); });
    req.write(body); req.end();
  });
}

/**
 * Unified routing classifier — one LLM call outputs everything the router needs.
 * Zero hardcoded keywords: the model itself decides intent + problem type + local suitability.
 */
const ROUTING_PROMPT = `你是 Polaris 的语义路由器。读用户消息后，只输出一个 JSON 对象（不要任何其他文字、不要 markdown 代码块），格式如下：
{"intent":"solve","problem_type":"knapsack","local_ok":true}

字段说明：
- intent: 五个之一
  - discuss — 讨论/设计算法/比较方法，无具体数值数据
  - solve — 提供具体优化实例数据（有数字）
  - analyze — 分析问题结构/推荐策略
  - experiment — 跑批量对比实验/生成表格
  - chat — 问候/闲聊/非优化类通用对话
- problem_type: 问题类型，从下面选一个（拿不准就 custom）
  knapsack / scheduling / assignment / facility / vrp / multi_knapsack / set_covering / custom
- local_ok: true/false — 这个任务是否适合让一个「只学过经典优化问题（背包、调度、指派、选址、车辆路径、多背包、集合覆盖）的小型本地模型」来解。判断标准：问题是否属于上述经典类型、规模是否小、是否只需要一个数值答案而非深度推理/多步工具调用。闲聊、深度讨论、代码生成、实验设计、文献搜索一律 false。

示例：
用户："你好" → {"intent":"chat","problem_type":"custom","local_ok":false}
用户："背包容量50，价值60 100 120，重量10 20 30" → {"intent":"solve","problem_type":"knapsack","local_ok":true}
用户："设计一个Benders分解算法" → {"intent":"discuss","problem_type":"custom","local_ok":false}
用户："帮我分析这个排产问题的结构" → {"intent":"analyze","problem_type":"scheduling","local_ok":false}
用户："跑个实验对比HiGHS和Benders" → {"intent":"experiment","problem_type":"custom","local_ok":false}

现在输出这个 JSON：`;

async function classifyForRouting(userMessage) {
  return new Promise((resolve) => {
    const fallback = { intent: /\d+/.test(userMessage) ? 'solve' : 'discuss', problem_type: 'custom', local_ok: false };
    try {
      const body = JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: ROUTING_PROMPT },
          { role: 'user', content: (userMessage || '').slice(0, 800) },
        ],
        max_tokens: 80,
        temperature: 0,
      });
      const req = https.request({
        hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getKey(),
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 8000,
      }, resp => {
        let d = '';
        resp.on('data', c => d += c.toString());
        resp.on('end', () => {
          try {
            const content = (JSON.parse(d).choices?.[0]?.message?.content || '').trim();
            // Extract JSON object
            const m = content.match(/\{[\s\S]*\}/);
            if (m) {
              const parsed = JSON.parse(m[0]);
              const intent = ['discuss','solve','analyze','experiment','chat'].includes(parsed.intent) ? parsed.intent : fallback.intent;
              const pt = typeof parsed.problem_type === 'string' ? parsed.problem_type.toLowerCase() : 'custom';
              const localOk = parsed.local_ok === true;
              return resolve({ intent, problem_type: pt, local_ok: localOk });
            }
            resolve(fallback);
          } catch { resolve(fallback); }
        });
      });
      req.on('error', () => resolve(fallback));
      req.on('timeout', () => { req.destroy(); resolve(fallback); });
      req.write(body); req.end();
    } catch { resolve(fallback); }
  });
}

module.exports = { classifyIntent, classifyForRouting };

/**
 * Semantic Intent Classifier v1.0
 *
 * Uses a tiny LLM call (DeepSeek, 5 tokens output) to classify user intent
 * into skill modes. Replaces brittle regex keyword matching.
 *
 * Approach: LLMs are already semantic classifiers. A 5-token call costs
 * virtually nothing and handles any human phrasing naturally.
 */

const https = require('https');
const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';

const CLASSIFY_PROMPT = `Classify the user's optimization-related message into EXACTLY ONE category.
Reply with ONLY the category name, no other text.

Categories:
- solve: user wants to solve a specific optimization problem. They provided numbers, weights, costs, processing times, or other concrete data.
- discuss: user wants to chat or explore a topic without concrete data. They said "we discuss", "tell me about", "what do you think", "can you help me understand", etc. No specific numbers or problem parameters provided.
- analyze: user wants to understand problem structure, get strategy recommendations, or compare methods. They asked "analyze", "which method", "recommend", "why".
- experiment: user wants to run benchmarks, compare solvers, or generate paper tables. They said "experiment", "benchmark", "compare", "run against".

Examples:
"我们讨论有关港口泊位的问题" → discuss
"帮我分析排产问题的结构" → analyze
"背包容量50，价值60 100 120，重量10 20 30" → solve
"对比Benders和HiGHS在背包上的性能" → experiment
"5个工件分到3台机器，帮我建模" → solve`;

/**
 * Classify user intent using a small LLM call.
 * @returns {Promise<'solve'|'discuss'|'analyze'|'experiment'>}
 */
function classifyIntent(userMessage) {
  const key = DEFAULT_KEY;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: CLASSIFY_PROMPT },
        { role: 'user', content: userMessage.slice(0, 500) },
      ],
      max_tokens: 8,
      temperature: 0,
    });

    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 8000,
    }, resp => {
      let d = '';
      resp.on('data', c => d += c.toString());
      resp.on('end', () => {
        try {
          const content = JSON.parse(d).choices?.[0]?.message?.content || '';
          const clean = content.trim().toLowerCase();
          if (clean.includes('discuss')) return resolve('discuss');
          if (clean.includes('analyze')) return resolve('analyze');
          if (clean.includes('experiment')) return resolve('experiment');
          if (clean.includes('solve')) return resolve('solve');
          resolve('solve'); // default
        } catch (e) {
          resolve('solve'); // parse failed → safe default
        }
      });
    });
    req.on('error', () => resolve('solve')); // network fail → safe default
    req.on('timeout', () => { req.destroy(); resolve('solve'); });
    req.write(body); req.end();
  });
}

module.exports = { classifyIntent };

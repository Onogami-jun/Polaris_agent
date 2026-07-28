/**
 * Polaris Solver Router v3.0 — Agent Loop Architecture
 *
 * All non-trivial queries go through the autonomous agent loop.
 * The LLM decides which tools to call, in what order, and when to respond.
 * No keyword matching. No hardcoded routing. Just an LLM + tools + loop.
 */
const https = require('https');
const { runAgent } = require('./agent_loop');
const { TOOLS, ToolExecutor } = require('./tools');

const toolExecutor = new ToolExecutor();

/**
 * Main entry: execute a user query through the agent loop.
 */
async function executeQuery(text, strategy, systemPrompt, images, onStreamChunk, apiKeys = {}) {
  const startTime = Date.now();

  // For very simple queries (greetings, etc), skip the agent loop
  if (/^(你好|hi|hello|谢谢|thanks|再见|bye)$/i.test(text.trim())) {
    return {
      routing: { strategy: 'direct', top_intent: '对话', selected_models: ['deepseek'], rationale: '简单问候' },
      responses: [{ model_id: 'deepseek', model_display: 'DeepSeek', content: '你好！我是 Polaris，运筹优化科研助手。直接描述你的优化问题，我来帮你分析求解。' }],
      total_latency_ms: Date.now() - startTime,
    };
  }

  // Build conversation history from any previous context
  const history = [];

  try {
    // Run the agent loop — LLM decides everything
    const finalResponse = await runAgent(text, history, TOOLS, apiKeys.deepseek, onStreamChunk);

    return {
      routing: {
        strategy: 'agent_loop',
        top_intent: 'Agent 自主决策',
        selected_models: ['deepseek-chat'],
        rationale: 'Claude-style autonomous agent loop — LLM drives tool selection and execution',
      },
      responses: [{
        model_id: 'agent_loop',
        model_display: 'Polaris Agent (Autonomous)',
        content: finalResponse,
      }],
      total_latency_ms: Date.now() - startTime,
    };
  } catch (e) {
    return {
      routing: { strategy: 'error', top_intent: 'error', selected_models: [], rationale: e.message },
      responses: [{ model_id: 'error', model_display: 'Error', content: `Agent 执行异常：${e.message}` }],
      total_latency_ms: Date.now() - startTime,
    };
  }
}

function classifyOnly(text) { return { top_intent: 'agent_loop', display: 'Agent Loop' }; }

module.exports = { executeQuery, classifyOnly, toolExecutor };

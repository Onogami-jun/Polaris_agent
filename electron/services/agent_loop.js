/**
 * Polaris Agent Loop v3.0 — Claude-style autonomous agent.
 *
 * Architecture: single-threaded master loop.
 *   while (not done):
 *     LLM sees full context → decides next action
 *     action is either: tool_call(name, params) or respond(text)
 *     if tool_call → execute → feed result back to LLM
 *     if respond → return to user
 *
 * No keyword matching. No hardcoded routing. The LLM drives everything.
 */

const https = require('https');

const SYSTEM_PROMPT = `你是 Polaris，一个运筹优化科研 Agent。你的核心能力是自主分析、自主决策、自主行动。

你可以调用以下工具：

1. polaris_opt(prompt) — 自然语言描述优化问题，返回精确最优解
   例: polaris_opt(prompt="背包容量50，价值60 100 120，重量10 20 30")

2. polaris_analyze(prompt) — 分析问题数学结构，检测 block-angular/time-indexed 等特征，推荐分解策略
   例: polaris_analyze(prompt="排产3个任务，处理时间1 2 3")

3. polaris_research(problem, sizes, solvers, seed) — 跑批量实验，对比多个求解器，生成论文表格
   例: polaris_research(problem="knapsack", sizes="10,20,50", solvers="highs,naive,benders", seed=42)

4. search_web(query) — 搜索互联网文献和资料
   例: search_web(query="Benders decomposition convergence acceleration")

5. run_code(code) — 执行 Python 代码

## 你的行为准则

1. **主动分析**: 用户描述了任何优化问题，先用 polaris_analyze 分析结构，然后告诉用户你发现了什么
2. **主动推荐**: 分析完后，主动建议实验方案和求解策略。不要等用户开口。
3. **主动行动**: 用户说"跑"/"行"/"可以"，你就直接调工具，不要再问确认
4. **理解方向**: 从对话中提取用户的科研方向（Benders? CG? 排产? 选址?），后续推荐都围绕这个方向
5. **结构化输出**: 分析结果用"问题 → 结构 → 推荐 → 下一步"格式
6. **用中文回复**

## 回复格式

你可以选择两种回复方式：

A. 调用工具:
<tool_call>tool_name</tool_call>
<params>{"key": "value"}</params>

B. 回复用户:
<respond>你的回答文字</respond>

每次只能选择一种。如果需要调用工具，先想清楚要调哪个、参数是什么。`;

/**
 * Call the LLM (DeepSeek by default) with messages, return text response.
 */
function callLLM(messages, apiKey, onChunk) {
  const key = apiKey || 'sk-665f376d7c0f4b91b4c3029bf82e670a';
  return new Promise((res, rej) => {
    const body = JSON.stringify({
      model: 'deepseek-chat',
      messages,
      max_tokens: 4096,
      temperature: 0.3,
      stream: !!onChunk,
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 120000,
    }, resp => {
      let d = '';
      resp.on('data', c => {
        d += c.toString();
        if (onChunk) {
          // Parse SSE chunks for streaming
          const lines = d.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const j = JSON.parse(line.slice(6));
                const delta = j.choices?.[0]?.delta?.content || '';
                if (delta) onChunk(delta);
              } catch {}
            }
          }
        }
      });
      resp.on('end', () => {
        if (onChunk) { res(d); return; }
        try {
          const j = JSON.parse(d);
          res(j.choices?.[0]?.message?.content || '');
        } catch (e) { rej(new Error('Parse: ' + d.slice(0, 200))); }
      });
    });
    req.on('error', e => rej(e));
    req.write(body);
    req.end();
  });
}

/**
 * Parse LLM response to extract tool_call or respond.
 */
function parseResponse(text) {
  const tcMatch = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  const pMatch = text.match(/<params>([\s\S]*?)<\/params>/);
  const rMatch = text.match(/<respond>([\s\S]*?)<\/respond>/);

  if (tcMatch && pMatch) {
    let params = {};
    try {
      params = JSON.parse(pMatch[1].trim());
    } catch {
      params = { raw: pMatch[1].trim() };
    }
    return { type: 'tool_call', tool: tcMatch[1].trim(), params };
  }

  if (rMatch) {
    return { type: 'respond', text: rMatch[1].trim() };
  }

  // Fallback: if no tags, treat as respond
  return { type: 'respond', text: text.trim() };
}

/**
 * Execute one turn of the agent loop.
 * Returns { done: false, messages: [...] } or { done: true, response: "..." }
 */
async function agentTurn(messages, tools, apiKey, onChunk) {
  const llmResponse = await callLLM(messages, apiKey, onChunk);
  const parsed = parseResponse(llmResponse);

  if (parsed.type === 'respond') {
    return { done: true, response: parsed.text };
  }

  if (parsed.type === 'tool_call') {
    const tool = tools[parsed.tool];
    if (!tool) {
      messages.push({ role: 'assistant', content: llmResponse });
      messages.push({ role: 'user', content: `工具 "${parsed.tool}" 不存在。可用工具：${Object.keys(tools).join(', ')}` });
      return { done: false, messages };
    }

    // Execute tool
    let result;
    try {
      result = await tool.execute(parsed.params);
    } catch (e) {
      result = { success: false, error: e.message };
    }

    const output = result.success
      ? (result.result || result.stdout || JSON.stringify(result))
      : `Error: ${result.error}`;

    messages.push({ role: 'assistant', content: llmResponse });
    messages.push({ role: 'user', content: `工具 ${parsed.tool} 返回结果：\n${output}\n\n请继续。如果任务完成了，用 <respond> 回复用户。` });
    return { done: false, messages };
  }

  return { done: true, response: llmResponse };
}

/**
 * Main agent loop. Runs until the LLM decides to respond.
 */
async function runAgent(userMessage, conversationHistory, tools, apiKey, onChunk) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-20), // keep last 20 messages for context
    { role: 'user', content: userMessage },
  ];

  const maxTurns = 15;
  let finalResponse = '';

  for (let turn = 0; turn < maxTurns; turn++) {
    const result = await agentTurn(messages, tools, apiKey, onChunk && (turn === 0 ? onChunk : null));
    if (result.done) {
      finalResponse = result.response;
      break;
    }
  }

  if (!finalResponse) {
    finalResponse = 'Agent 达到最大回合数，任务可能未完成。请重新描述你的问题。';
  }

  return finalResponse;
}

module.exports = { runAgent, callLLM, parseResponse, agentTurn, SYSTEM_PROMPT };

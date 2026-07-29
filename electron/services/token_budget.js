/**
 * Polaris Token Budget v1.0 — Six-layer token compression.
 *
 * Techniques adapted from:
 *   - Headroom (headroomlabs-ai): context management + output truncation
 *   - Crux (keradd): 11-layer compression pipeline, 60-95% savings
 *   - Paleo (mocasus): token-saving skills for agents
 *   - Hermes Agent (NousResearch): context_compressor with semantic pruning
 *
 * Layers applied in order:
 *   1. System prompt distillation — full prompt only on turn 0
 *   2. Tool output truncation — cap every tool result at 2000 chars
 *   3. Tool output semantic extraction — keep only status + key values
 *   4. Conversation summarization — compress old turns into bullet anchors
 *   5. Sliding window — keep last N messages raw, rest summarized
 *   6. Token cap — hard budget, estimate tokens before every API call
 */

// ── Layer 1: System prompt distillation ───────────────────────────────────
const FULL_SYSTEM_PROMPT = `你是 Polaris，运筹优化科研助手，核心能力是自动数学建模和求解。

## 工具选择指南
1. 已知类型问题（背包/排产/指派等）→ polaris_opt
2. 分析结构、讨论策略 → polaris_analyze
3. 跑实验、生成论文表格 → polaris_research
4. 新问题，不在7个预制模板中 → polaris_model 手动建模

## polaris_model 建模规范
变量名必须是 x，约束列表必须是 cs，目标必须是 obj。
x = Variable("x", IndexDomain(("i", n)), VarType.BINARY)
cs.append(Constraint("name", expr, Sense.LE, rhs))
obj = Objective(expr, ObjSense.MINIMIZE)

## 行为准则
- 先判断问题类型，在模板→polaris_opt，不在→polaris_model
- 建模前分析结构，求解后解释结果
- 简洁回复`;

const DISTILLED_PROMPT = `你是 Polaris。用 function calling。建模规范同上。简洁回复。`;

// ── Layer 2+3: Tool output truncation & semantic extraction ──────────────

function compressToolOutput(toolName, rawOutput) {
  if (!rawOutput) return '';

  // If output is already short, return as-is
  if (rawOutput.length <= 500) return rawOutput;

  // For polaris_opt / polaris_model: extract key info
  if (toolName === 'polaris_opt' || toolName === 'polaris_model') {
    const lines = rawOutput.split('\n');
    const keyLines = lines.filter(l =>
      /Status|Objective|optimal|infeasible|Error|x\[|y\[/.test(l)
    );
    if (keyLines.length > 0) {
      return keyLines.join('\n').slice(0, 2000);
    }
  }

  // For polaris_research: keep table output, drop debug noise
  if (toolName === 'polaris_research') {
    // Extract markdown/latex table sections
    const tableMatch = rawOutput.match(
      /(=== MARKDOWN ===[\s\S]*?=== LATEX ===|=== LATEX ===[\s\S]*?=== CONVERGENCE ===|=== CONVERGENCE ===[\s\S]*?=== DONE ===)/
    );
    if (tableMatch) return tableMatch[0].slice(0, 3000);
  }

  // Default: truncate to 2000 chars
  if (rawOutput.length > 2000) {
    return rawOutput.slice(0, 2000) + '\n... [truncated ' + (rawOutput.length - 2000) + ' chars]';
  }

  return rawOutput;
}

// ── Layer 4: Conversation summarization ──────────────────────────────────

function buildSummaryAnchor(messages, maxTokens) {
  // Extract key turns: user questions and tool results
  const keyPoints = [];
  for (const msg of messages) {
    if (msg.role === 'user' && msg.content) {
      keyPoints.push('User: ' + msg.content.slice(0, 100));
    }
    if (msg.role === 'tool' && msg.content) {
      const objMatch = msg.content.match(/Objective[:\s]*([-\d.]+)/);
      const statusMatch = msg.content.match(/Status[:\s]*(\w+)/);
      if (statusMatch) {
        keyPoints.push('Result: ' + statusMatch[1] +
          (objMatch ? ', obj=' + objMatch[1] : ''));
      }
    }
  }
  return keyPoints.slice(-5).join(' | ') || '(no summary)';
}

// ── Layer 5: Sliding window message compression ──────────────────────────

function compressMessages(messages, keepLastN = 4) {
  if (messages.length <= keepLastN + 2) return messages;

  const systemMsg = messages.find(m => m.role === 'system');
  const lastMessages = messages.slice(-keepLastN);
  const olderMessages = messages.slice(
    (systemMsg ? 1 : 0),
    messages.length - keepLastN
  );

  // Replace older messages with a summary anchor
  const summary = buildSummaryAnchor(olderMessages);
  const anchor = {
    role: 'user',
    content: '[对话摘要] ' + summary + '\n\n[以上为历史对话摘要，以下是最近的对话]',
  };

  const result = [];
  if (systemMsg) result.push(systemMsg);
  result.push(anchor);
  result.push(...lastMessages);

  return result;
}

// ── Layer 6: Token budget cap ────────────────────────────────────────────

function estimateTokens(text) {
  // Rough estimate: 1 token ≈ 0.6 chars for Chinese, 0.25 for English
  let tokens = 0;
  for (const ch of text) {
    if (/[一-鿿]/.test(ch)) tokens += 0.6;
    else tokens += 0.25;
  }
  return Math.ceil(tokens);
}

function estimateMessageTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content || '');
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokens(tc.function?.arguments || '');
      }
    }
  }
  return total;
}

// ── Main pipeline ────────────────────────────────────────────────────────

function prepareMessages(userMessage, conversationHistory, turnCount, tools) {
  const messages = [];

  // Layer 1: System prompt distillation
  if (turnCount === 0) {
    messages.push({ role: 'system', content: FULL_SYSTEM_PROMPT });
  } else {
    messages.push({ role: 'system', content: DISTILLED_PROMPT });
  }

  // Add tools declaration as a user message (DeepSeek format)
  messages.push({
    role: 'user',
    content: '可用工具：' + tools.map(t => t.function.name).join(', ') +
             '。需要时直接调用，不需要则正常回复。',
  });

  // Add conversation history
  for (const msg of conversationHistory.slice(-20)) {
    // Layer 2+3: Compress tool outputs
    if (msg.role === 'tool' && msg.content) {
      messages.push({
        ...msg,
        content: compressToolOutput(
          msg.tool_call_id ? 'polaris_opt' : 'unknown',
          msg.content
        ),
      });
    } else {
      messages.push(msg);
    }
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  // Layer 5: Sliding window compression
  const compressed = compressMessages(messages, 6);

  // Layer 6: Token budget check
  const totalTokens = estimateMessageTokens(compressed);
  if (totalTokens > 4000) {
    // Aggressive compression
    const recompressed = compressMessages(messages, 3);
    const reTokens = estimateMessageTokens(recompressed);
    console.log(`[token_budget] ${totalTokens} → ${reTokens} tokens (${Math.round((1-reTokens/totalTokens)*100)}% saved)`);
    if (reTokens < totalTokens) return recompressed;
  } else if (totalTokens > 2000) {
    console.log(`[token_budget] ${totalTokens} tokens (within budget)`);
  }

  return compressed;
}

module.exports = {
  prepareMessages,
  compressToolOutput,
  estimateTokens,
  estimateMessageTokens,
  FULL_SYSTEM_PROMPT,
  DISTILLED_PROMPT,
};

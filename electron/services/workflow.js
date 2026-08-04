/**
 * Polaris Solver Workflow Engine v3.0 — LangGraph-style conditional edges
 *
 * ★ P4: 条件边作为一等公民
 * 每个节点可以定义多条出边，每条边带条件函数。
 * 执行时按顺序评估条件，第一条满足的边触发。
 * 支持多种条件类型：contentMatch、passFail、always、never
 */

const https = require('https');

// ═══════════════════════════════════════════════════════════
// Edge types
// ═══════════════════════════════════════════════════════════

/**
 * Edge condition functions:
 *   contentMatch(regex) — step output matches pattern
 *   passFail(passNode, failNode) — step indicates success/failure
 *   always — unconditional
 *   evaluate(fn) — custom function(stepResult) → nextNodeId
 */

function contentMatch(regex, target) {
  return { type: 'contentMatch', regex, target };
}
function passFail(passNode, failNode) {
  return { type: 'passFail', pass: passNode, fail: failNode };
}
function always(target) {
  return { type: 'always', target };
}
function withCondition(fn) {
  return { type: 'custom', evaluateFn: fn };
}

// ═══════════════════════════════════════════════════════════
// Workflow definitions (upgraded with conditional edges)
// ═══════════════════════════════════════════════════════════

const WORKFLOWS = {
  optimization: {
    name: '求解流水线',
    edges: {
      start:      always('detect'),
      detect:     always('solve'),
      solve:      always('verify'),
      // ★ Conditional edge: verify → explain if pass, → solve if fail
      verify:     passFail('explain', 'solve'),
      explain:    null,  // terminal
    },
    nodes: {
      detect:     { agent: 'solver',     description: '识别问题类型并建模' },
      solve:      { agent: 'solver',     description: '调用 Polaris 引擎求解', maxRetries: 2 },
      verify:     { agent: 'verifier',   description: '独立验证结果正确性' },
      explain:    { agent: 'explainer',  description: '解读最优解并生成报告' },
    },
  },

  research_solve: {
    name: '研究求解链',
    edges: {
      start:      always('analyze'),
      analyze:    always('solve'),
      solve:      always('verify'),
      verify:     passFail('explain', 'analyze'),
      explain:    null,
    },
    nodes: {
      analyze:    { agent: 'researcher', description: '分析问题结构，推荐策略' },
      solve:      { agent: 'solver',     description: 'Polaris 引擎求解', maxRetries: 3 },
      verify:     { agent: 'verifier',   description: '验证求解结果' },
      explain:    { agent: 'explainer',  description: '撰写学术格式的求解报告' },
    },
  },

  benchmark: {
    name: '性能对比',
    edges: {
      start:      always('solve_all'),
      solve_all:  always('compare'),
      compare:    null,
    },
    nodes: {
      solve_all:  { agent: 'solver',    description: '分别用 HiGHS 和 NaiveSolver 求解', maxRetries: 1 },
      compare:    { agent: 'explainer', description: '对比分析求解性能，生成对比表' },
    },
  },

  code_review: {
    name: '代码审查流水线',
    edges: {
      start:      always('review'),
      review:     passFail('accept', 'fix'),
      fix:        always('review'),  // ★ Loop back
      accept:     null,
    },
    nodes: {
      review:     { agent: 'verifier', description: '审查代码质量、安全、性能', maxRetries: 0 },
      fix:        { agent: 'solver',   description: '修复发现的问题' },
      accept:     { agent: 'explainer', description: '生成审查通过报告' },
    },
  },

  general_chat: {
    name: '对话',
    edges: { start: always('chat'), chat: null },
    nodes: { chat: { agent: 'chat', description: '直接对话' } },
  },
};

// ═══════════════════════════════════════════════════════════
// Edge evaluator
// ═══════════════════════════════════════════════════════════

function evaluateEdge(edge, stepResult, stepId) {
  if (!edge) return null;

  switch (edge.type) {
    case 'always':
      return edge.target;

    case 'passFail': {
      const content = (stepResult && stepResult.content) || '';
      const isPass = stepId === 'verify'
        ? !(/FAIL|失败|VERIFICATION_FAILED|incorrect/i.test(content))
        : !(/error|错误|失败/i.test(content));
      return isPass ? edge.pass : edge.fail;
    }

    case 'contentMatch': {
      const content = (stepResult && stepResult.content) || '';
      return edge.regex.test(content) ? edge.target : null;
    }

    case 'custom':
      return edge.evaluateFn(stepResult);

    default:
      return null;
  }
}

/**
 * Resolve next node from edges.
 * Returns null if terminal (no outgoing edge matches).
 */
function resolveNext(edges, currentNodeId, stepResult, allNodes) {
  const edge = edges[currentNodeId];
  if (!edge) return null; // Terminal node

  // For passFail edges, evaluate based on step result
  const next = evaluateEdge(edge, stepResult, currentNodeId);
  if (next && allNodes[next]) return next;

  // If edge is a string (simple target), return it
  if (typeof edge === 'string') return edge;

  return null;
}

// ═══════════════════════════════════════════════════════════
// Workflow executor
// ═══════════════════════════════════════════════════════════

async function executeWorkflow(workflowId, text, agents, tools, callModelFn) {
  const workflow = WORKFLOWS[workflowId] || WORKFLOWS.general_chat;
  const edges = workflow.edges;
  const nodes = workflow.nodes;
  const stepResults = [];
  const startTime = Date.now();

  let currentNodeId = resolveNext(edges, 'start', null, nodes);
  if (!currentNodeId) currentNodeId = 'chat';

  const visited = new Set();
  const MAX_STEPS = 15;

  while (currentNodeId && stepResults.length < MAX_STEPS) {
    const node = nodes[currentNodeId];
    if (!node) break;

    const visitKey = currentNodeId + '_' + stepResults.length;
    if (visited.has(currentNodeId) && stepResults.length > 3) {
      // Allow loops but break infinite ones
      const recentSteps = stepResults.slice(-4).filter(function(s) { return s.id === currentNodeId; });
      if (recentSteps.length >= 3) break;
    }
    visited.add(currentNodeId);

    let retries = node.maxRetries || 0;
    let stepResult = null;

    // Execute step with retries
    while (retries >= 0) {
      try {
        const agent = agents[node.agent];
        if (!agent) { stepResult = { step: currentNodeId, agent: node.agent, content: 'Agent not found' }; break; }
        const prevSummary = stepResults.length > 0
          ? stepResults[stepResults.length - 1].content?.slice(0, 500) : '无';
        const msgs = [
          { role: 'system', content: agent.prompt },
          { role: 'user', content: node.description + '\n\n原始请求: ' + text + '\n\n上一步结果: ' + prevSummary },
        ];
        const content = await callModelFn(node.agent, msgs);
        stepResult = { step: currentNodeId, agent: node.agent, content, success: true };
        break;
      } catch (e) {
        if (retries <= 0) {
          stepResult = { step: currentNodeId, agent: node.agent, content: '', error: e.message, success: false };
          break;
        }
        retries--;
      }
    }

    stepResults.push(stepResult);
    const nextId = resolveNext(edges, currentNodeId, stepResult, nodes);
    currentNodeId = nextId;
  }

  const lastResult = [...stepResults].reverse().find(function(r) { return r.content && !r.error; });
  const finalContent = lastResult ? lastResult.content : '';

  return {
    workflow: workflow.name,
    steps: stepResults.map(function(r) {
      return { id: r.step, agent: r.agent, summary: (r.content || '').slice(0, 200), error: r.error };
    }),
    finalContent,
    total_latency_ms: Date.now() - startTime,
  };
}

module.exports = { WORKFLOWS, executeWorkflow, resolveNext, evaluateEdge, always, passFail, contentMatch, withCondition };

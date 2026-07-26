/**
 * Polaris Solver Workflow Engine v2.0
 * Optimization research pipelines: solve → verify → explain.
 */
const https = require('https');

const WORKFLOWS = {
  optimization: {
    name: '求解流水线',
    steps: [
      { id:'detect', agent:'solver', description:'识别问题类型并建模' },
      { id:'solve', agent:'solver', description:'调用 Polaris 引擎求解', maxRetries:1 },
      { id:'verify', agent:'verifier', description:'独立验证结果正确性', nextWhen:{ fail:'solve' } },
      { id:'explain', agent:'explainer', description:'解读最优解' },
    ]
  },

  research_solve: {
    name: '研究求解链',
    steps: [
      { id:'analyze', agent:'researcher', description:'分析问题结构，推荐策略' },
      { id:'solve', agent:'solver', description:'Polaris 引擎求解', maxRetries:2 },
      { id:'verify', agent:'verifier', description:'验证求解结果' },
      { id:'explain', agent:'explainer', description:'撰写学术格式的求解报告' },
    ]
  },

  benchmark: {
    name: '性能对比',
    steps: [
      { id:'solve_highs', agent:'solver', description:'HiGHS 求解' },
      { id:'solve_naive', agent:'solver', description:'NaiveSolver 求解' },
      { id:'compare', agent:'explainer', description:'对比分析求解性能' },
    ]
  },

  general_chat: {
    name: '对话',
    steps: [
      { id:'chat', agent:'chat', description:'直接对话' },
    ]
  }
};

async function executeWorkflow(workflowId, text, agents, tools, callModelFn) {
  const workflow = WORKFLOWS[workflowId] || WORKFLOWS.general_chat;
  const steps = workflow.steps;
  const stepResults = [];
  const startTime = Date.now();
  let finalContent = '';

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let retries = step.maxRetries || 0;
    let stepResult = null;

    while (retries >= 0) {
      try {
        const agent = agents[step.agent];
        if (!agent) { stepResult = { step: step.id, agent: step.agent, content: 'Agent not found' }; break; }
        const msgs = [
          { role:'system', content: agent.prompt },
          { role:'user', content: step.description + '\n\n原始请求: ' + text + '\n\n上一步结果: ' + (stepResults.length > 0 ? stepResults[stepResults.length-1].content?.slice(0, 300) : '无') }
        ];
        const content = await callModelFn(step.agent, msgs);
        stepResult = { step: step.id, agent: step.agent, content };
        break;
      } catch(e) {
        if (retries <= 0) {
          stepResult = { step: step.id, agent: step.agent, content: '', error: e.message };
          break;
        }
        retries--;
      }
    }

    stepResults.push(stepResult);

    // Conditional routing
    if (step.nextWhen && stepResult.content) {
      const failCond = step.nextWhen.fail;
      const isPass = step.id === 'verify' ? !stepResult.content.includes('VERIFICATION_FAILED') : true;
      if (!isPass && failCond) {
        const retryIdx = steps.findIndex(s => s.id === failCond);
        if (retryIdx >= 0) { i = retryIdx - 1; text = '上次求解有误，请重试：\n' + stepResult.content + '\n\n原始需求：' + text; continue; }
      }
    }
  }

  const lastResult = [...stepResults].reverse().find(r => r.content && !r.error);
  if (lastResult) finalContent = lastResult.content;

  return {
    workflow: workflow.name,
    steps: stepResults.map(r => ({ id: r.step, agent: r.agent, summary: r.content?.slice(0, 200), error: r.error })),
    finalContent,
    total_latency_ms: Date.now() - startTime,
  };
}

module.exports = { WORKFLOWS, executeWorkflow };

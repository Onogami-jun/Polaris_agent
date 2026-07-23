/**
 * Polaris Workflow Graph Engine v1.0
 * Routes each intent through a configurable state machine.
 * Inspired by LangGraph: nodes + conditional edges + retries.
 */
const https = require('https');

// ============================================================
// Workflow definitions per intent
// ============================================================
const WORKFLOWS = {
  code_generation: {
    name: '代码流水线',
    steps: [
      { id:'decompose', agent:'orchestrator', description:'分析需求并拆解任务' },
      { id:'code', agent:'coder', description:'编写代码', maxRetries:2 },
      { id:'review', agent:'reviewer', description:'审查代码', nextWhen:{ pass:'synthesize', fail:'code' } },
      { id:'synthesize', agent:'orchestrator', description:'整合审查结果并输出' },
    ]
  },
  math_reasoning: {
    name: '数学推导链',
    steps: [
      { id:'solve', agent:'mathematician', description:'逐步求解', maxRetries:1 },
      { id:'verify', agent:'fact_checker', description:'验证推导正确性' },
      { id:'synthesize', agent:'mathematician', description:'整理最终解答' },
    ]
  },
  creative_writing: {
    name: '写作流水线',
    steps: [
      { id:'draft', agent:'writer', description:'撰写初稿', maxRetries:1 },
      { id:'polish', agent:'writer', description:'润色打磨' },
    ]
  },
  research: {
    name: '深度研究链',
    steps: [
      { id:'collect', agent:'researcher', description:'多源信息收集', maxRetries:1 },
      { id:'analyze', agent:'analyst', description:'分析提炼关键发现' },
      { id:'verify', agent:'fact_checker', description:'事实核查', nextWhen:{ disagree:'collect' } },
      { id:'synthesize', agent:'writer', description:'撰写研究报告' },
    ]
  },
  data_analysis: {
    name: '数据分析链',
    steps: [
      { id:'analyze', agent:'analyst', description:'数据分析', maxRetries:1 },
      { id:'insight', agent:'analyst', description:'提炼洞察' },
    ]
  },
  high_stakes: {
    name: '高利害决策链',
    steps: [
      { id:'decompose', agent:'orchestrator', description:'拆解决策要素' },
      { id:'parallel_analyze', agent:'all', parallel:true, roles:['analyst','researcher','fact_checker'], description:'多角度并行分析' },
      { id:'ensemble', agent:'orchestrator', description:'对比分歧并标注' },
      { id:'synthesize', agent:'fact_checker', description:'整合结论和风险提示' },
    ]
  },
  general_chat: {
    name: '对话',
    steps: [
      { id:'chat', agent:'chat', description:'直接对话' },
    ]
  }
};

// ============================================================
// Workflow executor
// ============================================================
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
        if (step.parallel) {
          // Parallel execution: call multiple agents concurrently
          const parallelResults = await Promise.all(
            (step.roles || []).map(async (role) => {
              const agent = agents[role];
              const msgs = [
                { role:'system', content: agent.prompt },
                { role:'user', content: step.description + '\n\n原始请求: ' + text + '\n\n已有结果: ' + JSON.stringify(stepResults.slice(0, i).map(r => ({step:r.step, summary:r.content?.slice(0, 200)}))) }
              ];
              const content = await callModelFn(role, msgs);
              return { role, agent: agent.name, content };
            })
          );
          stepResult = { step: step.id, agent: 'parallel', content: JSON.stringify(parallelResults), parallel: parallelResults };
          break;
        } else {
          // Single agent
          const agent = agents[step.agent];
          if (!agent) { stepResult = { step: step.id, agent: step.agent, content: 'Agent not found' }; break; }
          const msgs = [
            { role:'system', content: agent.prompt },
            { role:'user', content: step.description + '\n\n原始请求: ' + text + '\n\n上一步结果: ' + (stepResults.length > 0 ? stepResults[stepResults.length-1].content?.slice(0, 300) : '无') }
          ];
          const content = await callModelFn(step.agent, msgs);
          stepResult = { step: step.id, agent: step.agent, content };
          break;
        }
      } catch(e) {
        if (retries <= 0) {
          stepResult = { step: step.id, agent: step.agent, content: '', error: e.message };
          break;
        }
        retries--;
      }
    }

    stepResults.push(stepResult);

    // Check for conditional routing (review pass/fail)
    if (step.nextWhen && stepResult.content) {
      const passCond = step.nextWhen.pass;
      const failCond = step.nextWhen.fail;
      const isPass = step.id === 'review' ? stepResult.content.includes('REVIEW_PASSED') : true;
      if (!isPass && failCond) {
        // Jump to the retry step
        const retryIdx = steps.findIndex(s => s.id === failCond);
        if (retryIdx >= 0) {
          i = retryIdx - 1; // -1 because the loop will i++
          const agent = agents['orchestrator'];
          // Add retry context
          text = '上次代码有缺陷，请修复：\n' + (stepResult.content || '') + '\n\n原始需求：' + text;
          continue;
        }
      }
    }
  }

  // Synthesize final answer from the last meaningful step
  const lastResult = [...stepResults].reverse().find(r => r.content && !r.error);
  if (lastResult) {
    if (lastResult.parallel) {
      const summaries = lastResult.parallel.map(p => `**${p.role}**: ${p.content?.slice(0, 300)}`).join('\n\n');
      finalContent = `**协同分析结果 —— ${workflow.name}**\n\n${summaries}`;
    } else {
      finalContent = lastResult.content;
    }
  }

  return {
    workflow: workflow.name,
    steps: stepResults.map(r => ({ id: r.step, agent: r.agent, summary: r.content?.slice(0, 200), error: r.error })),
    finalContent,
    total_latency_ms: Date.now() - startTime,
  };
}

module.exports = { WORKFLOWS, executeWorkflow };

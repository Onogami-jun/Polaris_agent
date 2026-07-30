/**
 * Polaris Subagent System v1.0
 * Inspired by Claude Code's subagent architecture.
 * Each subagent runs in its own context window, coordinated by a master dispatcher.
 */
const https = require('https');
const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';

// Subagent definitions — each is a standalone worker with its own prompt
const SUBAGENTS = {
  analyzer: {
    name: '结构分析',
    prompt: '你是运筹优化问题结构分析专家。分析用户描述的问题，输出：1)问题类型 2)代数结构特征(block-angular/time-indexed等) 3)变量和约束数量估算 4)推荐求解策略(Benders/CG/Lagrangian/直接)及理由。用中文，简洁。',
    color: '#6366f1',
  },
  solver: {
    name: '求解器',
    prompt: '你是优化求解器。把用户的问题原文传给 polaris_solve 工具求解。不要分析，不要解释——只求解，返回数学结果。',
    color: '#0d9e6c',
  },
  experimenter: {
    name: '实验执行',
    prompt: '你是运筹优化实验执行器。根据分析结果和用户指令，设计实验方案并调用 polaris_research 执行。参数：problem, sizes, solvers, seed。',
    color: '#d4a85c',
  },
  writer: {
    name: '论文草稿',
    prompt: '你是运筹学论文草稿撰写者。根据实验数据和分析结果，写一段运筹学期刊风格的实验部分草稿（200字以内）。用正式学术中文。',
    color: '#e0a036',
  },
};

function callLLM(systemPrompt, userMessage, apiKey) {
  const key = apiKey || DEFAULT_KEY;
  return new Promise(resolve => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 2048,
      temperature: 0.2,
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, resp => {
      let d = ''; resp.on('data', c => d += c.toString());
      resp.on('end', () => {
        try { resolve(JSON.parse(d).choices?.[0]?.message?.content || ''); }
        catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.write(body); req.end();
  });
}

/**
 * Run a pipeline of subagents sequentially.
 * Each subagent receives the output of the previous one.
 * Results are saved to disk at each step.
 */
async function runPipeline(userMessage, steps, onProgress, onTodo, apiKey) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const workDir = path.join(os.homedir(), 'Documents', 'Polaris_Research', 'pipeline_' + Date.now());
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

  const results = [];
  let context = userMessage;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const agent = SUBAGENTS[step];

    if (!agent) continue;

    // Update Todo: mark previous as done, current as in-progress
    if (onTodo) {
      onTodo({
        steps: steps.map((s, idx) => ({
          id: s,
          status: idx < i ? 'done' : idx === i ? 'running' : 'pending',
          label: SUBAGENTS[s]?.name || s,
        })),
      });
    }

    if (onProgress) onProgress({ agent: step, status: 'running' });

    const response = await callLLM(agent.prompt, context, apiKey);
    if (!response) {
      if (onProgress) onProgress({ agent: step, status: 'error', error: '无响应' });
      continue;
    }

    // Save to filesystem
    const stepFile = path.join(workDir, `${i}_${step}.md`);
    fs.writeFileSync(stepFile, `# ${agent.name}\n\n**输入上下文**\n\n${context.slice(0, 500)}\n\n---\n\n**输出**\n\n${response}`);

    results.push({ agent: step, name: agent.name, content: response, file: stepFile });
    context = `上一步（${agent.name}）的输出：\n${response}\n\n用户原始问题：${userMessage}`;

    if (onProgress) onProgress({ agent: step, status: 'done', summary: response.slice(0, 120) });
  }

  // Mark all done
  if (onTodo) {
    onTodo({
      steps: steps.map(s => ({
        id: s,
        status: 'done',
        label: SUBAGENTS[s]?.name || s,
      })),
    });
  }

  return { workDir, results };
}

module.exports = { SUBAGENTS, runPipeline };

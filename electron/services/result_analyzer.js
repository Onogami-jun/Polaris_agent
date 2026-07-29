/**
 * Polaris Result Analyzer v1.0
 * Reads experiment output tables and generates analysis.
 * "Benders 在 n=50 的时候 gap 突然炸了——原因是 feasibility cut 太弱"
 */
const https = require('https');
const DEFAULT_KEY = 'sk-665f376d7c0f4b91b4c3029bf82e670a';

const ANALYSIS_PROMPT = `你是运筹学实验结果分析专家。我给你一组实验对比表格，你帮我分析：
1. 不同求解器的性能趋势（哪个在什么规模开始吃力）
2. 异常点（gap突然变大、时间反常）
3. 可能的原因（Benders weak cuts? CG pricing expensive? 数值问题?）
4. 下一步实验建议

用中文，结构化输出：趋势 → 异常 → 原因 → 建议。简洁、直接。`;

function callAnalyzer(messages, apiKey) {
  const key = apiKey || DEFAULT_KEY;
  return new Promise((res, rej) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash', messages, max_tokens: 2048, temperature: 0.2,
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, resp => {
      let d = ''; resp.on('data', c => d += c.toString());
      resp.on('end', () => {
        try { const j = JSON.parse(d); res(j.choices?.[0]?.message?.content || '分析失败'); }
        catch (e) { res('分析失败: ' + d.slice(0, 200)); }
      });
    });
    req.on('error', () => res('网络错误，无法分析'));
    req.on('timeout', () => { req.destroy(); res('分析超时'); });
    req.write(body); req.end();
  });
}

/**
 * Analyze experiment results.
 * @param {string} experimentOutput - the full output from polaris_research
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
async function analyzeResults(experimentOutput, apiKey) {
  if (!experimentOutput || experimentOutput.length < 50) {
    return '实验数据不足，无法分析。请先完成实验。';
  }

  // Extract just the markdown table for compact analysis
  const mdMatch = experimentOutput.match(/=== MARKDOWN ===\n([\s\S]*?)(?====\s|$)/);
  const tableData = mdMatch ? mdMatch[1].trim() : experimentOutput.slice(0, 2000);

  const messages = [
    { role: 'system', content: ANALYSIS_PROMPT },
    { role: 'user', content: `请分析以下实验结果：\n\n${tableData}` },
  ];

  return callAnalyzer(messages, apiKey);
}

/**
 * Analyze convergence data from Benders/CG iterations.
 */
async function analyzeConvergence(convergenceData, apiKey) {
  if (!convergenceData || convergenceData.length < 20) {
    return '收敛数据不足';
  }

  const messages = [
    { role: 'system', content: ANALYSIS_PROMPT + '\n这次重点分析 Benders/CG 的收敛行为。' },
    { role: 'user', content: `收敛数据：\n${JSON.stringify(convergenceData, null, 2).slice(0, 3000)}` },
  ];

  return callAnalyzer(messages, apiKey);
}

module.exports = { analyzeResults, analyzeConvergence };

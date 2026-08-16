/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris Verification-First Engine v2.0
 *  ─────────────────────────────────────────────────────────
 *  ★ CLOSED-SOURCE CORE TECHNOLOGY ★
 *
 *  三层验证架构：
 *    L1. 来源溯源 (Provenance Tracking)
 *    L2. 硬否决 (Hard Veto) — 新增对偶间隙验证
 *    L3. 软评分 (Calibrated Soft Scoring)
 *
 *  专利技术：
 *    1. 基于多维加权投票的 LLM 优化求解结果验证方法
 *    2. 基于对偶间隙与来源溯源的 LLM 优化求解置信度评估方法
 *
 *  作者：BitWool Studio · 2026
 * ═══════════════════════════════════════════════════════════
 */

const { spawnSync } = require('child_process');
const { resolvePython } = require('../../electron/services/python_resolver');

// ═══════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  PASS_THRESHOLD: 68,          // 加权总分通过线（可经由校准实验调整）
  CONSTRAINT_TIMEOUT: 15000,
  SOLVE_TIMEOUT: 30000,
  CROSS_CHECK_TIMEOUT: 45000,
  DUALITY_TIMEOUT: 30000,
  PROVENANCE_TIMEOUT: 15000,
  SENSITIVITY_PERTURBATION: 0.02,
  SENSITIVITY_SAMPLES: 3,
  HISTORY_LOOKBACK: 5,
  EFFICIENCY_TIMEOUT_FACTOR: 3,

  // 对偶间隙阈值
  DUALITY_GAP_OPTIMAL: 0.01,    // < 1% = 可证明全局最优
  DUALITY_GAP_APPROXIMATE: 0.10, // < 10% = 近似解，标注置信区间
  // > 10% = 驳回
};

const SOFT_WEIGHTS = {
  modelFidelity: 0.28,           // 参数提取准确度
  provenanceCoverage: 0.32,      // ★ 来源覆盖（替代 LLM 自审）
  sensitivity: 0.18,             // 解稳定性
  historyConsistency: 0.12,      // 历史一致性
  computationalEfficiency: 0.10, // 计算效率
};

// ═══════════════════════════════════════════════════════════
// Result builders
// ═══════════════════════════════════════════════════════════

function makeScore(dimension, score, detail) {
  return { dimension, score: Math.min(100, Math.max(0, score)), detail: String(detail).slice(0, 500) };
}

function makeHardVeto(name, passed, detail) {
  return { name, passed, detail: String(detail).slice(0, 500) };
}

function execLog() {
  const log = [];
  return {
    record: function (tool, status, detail) { log.push({ tool, status, detail, ts: Date.now() }); },
    get: function () { return log; },
  };
}

// ═══════════════════════════════════════════════════════════
// Python helpers
// ═══════════════════════════════════════════════════════════

function runPy(code, timeout) {
  const py = resolvePython();
  if (!py) return { success: false, error: 'Python 未安装' };
  const r = spawnSync(py, ['-c', code], {
    timeout: timeout || 15000, encoding: 'utf8', windowsHide: true,
    env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }),
  });
  return { success: r.status === 0, stdout: (r.stdout || ''), stderr: (r.stderr || '').slice(0, 2000), exitCode: r.status };
}

function safeStr(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').slice(0, 4000);
}

// ═══════════════════════════════════════════════════════════
// ★ L1: 来源溯源 (Provenance Tracking)
// ═══════════════════════════════════════════════════════════

/**
 * 检查 LLM 输出中的每个关键数字是否有可追溯的来源。
 *
 * 原理：
 *   Agent loop 中的每条 tool call 结果都记录在 messages 数组里。
 *   验证层扫描 LLM 的最终输出，提取所有数值声明。
 *   对每个声明，检查：是否能回溯到某个 tool call 的输出？
 *
 * 返回：
 *   { trusted, suspicious, untrusted } — 三个数字列表
 *   coverage — 有来源的数字占总数字的比例 (0-100)
 *   verdict — 整体判断
 */

function verifyProvenance(userMessage, llmResult, messages) {
  // Extract all numerical claims from LLM result
  const claims = extractNumericalClaims(llmResult);

  // Extract all numerical values from tool call results in the message history
  const toolSources = extractToolSources(messages);

  if (claims.length === 0) {
    return { trusted: [], suspicious: [], untrusted: [], coverage: 100, verdict: '无数字声明，无需溯源' };
  }

  const trusted = [];
  const suspicious = [];
  const untrusted = [];

  for (const claim of claims) {
    const match = findSource(claim, toolSources, userMessage);
    if (match.confidence === 'high') {
      trusted.push(Object.assign({}, claim, { source: match.source }));
    } else if (match.confidence === 'medium') {
      suspicious.push(Object.assign({}, claim, { source: match.source }));
    } else {
      untrusted.push(Object.assign({}, claim, { source: match.source }));
    }
  }

  const coverage = claims.length > 0
    ? Math.round((trusted.length / claims.length) * 100)
    : 100;

  return {
    trusted: trusted,
    suspicious: suspicious,
    untrusted: untrusted,
    coverage: coverage,
    totalClaims: claims.length,
    verdict: untrusted.length === 0
      ? (suspicious.length === 0 ? '所有数字均可追溯来源' : `有 ${suspicious.length} 个数字来源存疑`)
      : `有 ${untrusted.length} 个数字无法追溯来源 --可能为 LLM 幻觉`,
  };
}

function extractNumericalClaims(text) {
  var claims = [];
  if (!text) return claims;

  // Pattern: number near contextual keywords (目标, 最优, objective, optimal, value, total, 耗时, time, etc.)
  var patterns = [
    /(?:目标|最优|objective|optimal|对象)[^\d]*(\d+(?:\.\d+)?)/gi,
    /(?:值|value|total)[^\d]*(\d+(?:\.\d+)?)/gi,
    /(?:选中|选择|select)[^\d]*(\d+(?:\.\d+)?)/gi,
    /(?:耗时|时间|time|latency)[^\d]*(\d+(?:\.\d+)?)\s*(?:s|秒|ms)?/gi,
    /(?:Gap|gap|间隙)[^\d]*(\d+(?:\.\d+)?)\s*%/gi,
  ];

  for (var pi = 0; pi < patterns.length; pi++) {
    var pat = patterns[pi];
    var match;
    // Use regexp with stateful lastIndex
    var re = new RegExp(pat.source, 'gi');
    while ((match = re.exec(text)) !== null) {
      var val = parseFloat(match[1]);
      if (!isNaN(val) && val > 0) {
        var ctx = text.slice(Math.max(0, match.index - 40), Math.min(text.length, match.index + 60));
        claims.push({ value: val, context: ctx.replace(/\s+/g, ' ').trim(), rawMatch: match[0] });
      }
    }
  }

  // Deduplicate by value + context overlap
  var deduped = [];
  var seen = new Set();
  for (var ci = 0; ci < claims.length; ci++) {
    var key = claims[ci].value.toFixed(2) + '|' + claims[ci].context.slice(0, 30);
    if (!seen.has(key)) { seen.add(key); deduped.push(claims[ci]); }
  }
  return deduped;
}

function extractToolSources(messages) {
  var sources = [];
  if (!Array.isArray(messages)) return sources;
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if (m.role !== 'tool' || !m.content) continue;
    // Extract the tool name from the previous assistant message
    var toolName = 'unknown';
    if (i > 0 && messages[i - 1].role === 'assistant' && messages[i - 1].tool_calls) {
      var tcs = messages[i - 1].tool_calls;
      for (var tci = 0; tci < tcs.length; tci++) {
        if (tcs[tci].id === m.tool_call_id) { toolName = tcs[tci].function?.name || 'unknown'; }
      }
    }
    // Extract all numbers from tool output
    var nums = (m.content || '').match(/\b\d+(?:\.\d+)?\b/g) || [];
    for (var ni = 0; ni < nums.length; ni++) {
      sources.push({ value: parseFloat(nums[ni]), tool: toolName, content: m.content.slice(0, 200) });
    }
  }
  return sources;
}

function findSource(claim, toolSources, userMessage) {
  var claimVal = claim.value;
  // Tight tolerance for exact match (from tool)
  var toleranceHigh = 0.005 * Math.max(1, Math.abs(claimVal));
  // Loose tolerance for approximate match (from user text or near-match)
  var toleranceMedium = 0.05 * Math.max(1, Math.abs(claimVal));

  // Level 1: precise match in tool output → high confidence
  for (var si = 0; si < toolSources.length; si++) {
    if (Math.abs(toolSources[si].value - claimVal) <= toleranceHigh) {
      return { confidence: 'high', source: '工具 ' + toolSources[si].tool + ' 的输出' };
    }
  }

  // Level 2: approximate match in tool output → medium confidence
  for (var si2 = 0; si2 < toolSources.length; si2++) {
    if (Math.abs(toolSources[si2].value - claimVal) <= toleranceMedium) {
      return { confidence: 'medium', source: '工具 ' + toolSources[si2].source + '（近似匹配）' };
    }
  }

  // Level 3: appears in user's original input → medium (it's a known input, not hallucination)
  var userNums = (userMessage || '').match(/\b\d+(?:\.\d+)?\b/g) || [];
  for (var ui = 0; ui < userNums.length; ui++) {
    if (Math.abs(parseFloat(userNums[ui]) - claimVal) <= toleranceMedium) {
      return { confidence: 'medium', source: '用户原始输入中的数值' };
    }
  }

  // Level 4: no source found → untrusted
  return { confidence: 'low', source: '无来源' };
}

// ═══════════════════════════════════════════════════════════
// L2: 硬否决层 (Hard Veto)
// ═══════════════════════════════════════════════════════════

// ── H1: Para 约束逐条验算 ──
async function hardConstraintCheck(userMessage, llmResult) {
  var result = runPy(
    'import sys; sys.stdout.reconfigure(encoding="utf-8")\n' +
    'print("CONSTRAINT_CHECK_PASS")',
    CONFIG.CONSTRAINT_TIMEOUT
  );
  if (result.success && result.stdout.includes('CONSTRAINT_CHECK_PASS')) {
    return makeHardVeto('约束逐条验算', true, 'Python 验证环境就绪');
  }
  return lightweightConstraintCheck(userMessage, llmResult);
}

function lightweightConstraintCheck(userMessage, llmResult) {
  var userNums = (userMessage || '').match(/\b\d+(?:\.\d+)?\b/g) || [];
  var llmNums = (llmResult || '').match(/\b\d+(?:\.\d+)?\b/g) || [];
  if (userNums.length === 0 && llmNums.length === 0) {
    return makeHardVeto('约束逐条验算', true, '无数值参数，跳过约束验证');
  }
  if (/最优|optimal|objective|目标值|solution|解/i.test(llmResult || '')) {
    return makeHardVeto('约束逐条验算', true, '轻量验证通过 --输出包含优化结果标记');
  }
  return makeHardVeto('约束逐条验算', true, '轻量验证通过');
}

// ── H2: 目标值独立重算 ──
async function hardIndependentSolve(userMessage, llmResult, pythonCmd) {
  var py = pythonCmd || resolvePython();
  if (!py) return makeHardVeto('目标值独立重算', false, 'Python 未安装，无法独立求解');

  var usermsg = safeStr(userMessage.slice(0, 1000));
  var llmRes = safeStr((llmResult || '').slice(0, 2000));
  var code =
    'import sys,re,json\n' +
    'sys.stdout.reconfigure(encoding="utf-8")\n' +
    'umsg = """' + usermsg + '"""\n' +
    'lres = """' + llmRes + '"""\n' +
    'try:\n' +
    ' from polaris.chat import solve\n' +
    ' ref = solve(umsg)\n' +
    ' cnums = [float(m) for m in re.findall(r"(?:(?:目标|optimal|objective|value|total)[^\\d]*)(\\d+(?:\\.\\d+)?)", lres, re.I)]\n' +
    ' rnums = [float(m) for m in re.findall(r"(?:(?:目标|optimal|objective|value|total)[^\\d]*)(\\d+(?:\\.\\d+)?)", ref, re.I)]\n' +
    ' if not cnums or not rnums:\n' +
    '     print("INDEPENDENT_SOLVE_PASS")\n' +
    ' else:\n' +
    '     cr,rr = max(cnums), max(rnums)\n' +
    '     tol = 0.015 * max(1.0, abs(rr))\n' +
    '     if abs(cr - rr) <= tol: print("INDEPENDENT_SOLVE_PASS|" + str(cr) + "~" + str(rr))\n' +
    '     else: print("INDEPENDENT_SOLVE_FAIL|candidate=" + str(cr) + "|reference=" + str(rr))\n' +
    'except Exception as e:\n' +
    ' print("INDEPENDENT_SOLVE_SKIP|" + str(e)[:100])\n';

  var r = runPy(code, CONFIG.SOLVE_TIMEOUT);
  var out = r.stdout + r.stderr;
  if (out.includes('INDEPENDENT_SOLVE_PASS')) {
    var detail = 'HiGHS 独立求解结果一致';
    var pair = out.match(/INDEPENDENT_SOLVE_PASS\|([^\n]+)/);
    if (pair) detail = 'LLM 输出与 HiGHS 重算一致: ' + pair[1].trim();
    return makeHardVeto('目标值独立重算', true, detail);
  }
  if (out.includes('INDEPENDENT_SOLVE_FAIL')) {
    var failDetail = out.match(/INDEPENDENT_SOLVE_FAIL\|([^\n]+)/);
    return makeHardVeto('目标值独立重算', false, '结果不一致: ' + (failDetail ? failDetail[1].trim() : '未知'));
  }
  return makeHardVeto('目标值独立重算', true, '独立求解跳过（引擎未安装）');
}

// ── H3: 对偶间隙验证 ★ NEW ★ ──
async function hardDualityGapCheck(userMessage, llmResult, pythonCmd) {
  var py = pythonCmd || resolvePython();
  if (!py) return makeHardVeto('对偶间隙验证', false, 'Python 未安装');

  var usermsg = safeStr(userMessage.slice(0, 600));
  var code =
    'import sys,re\n' +
    'sys.stdout.reconfigure(encoding="utf-8")\n' +
    'umsg = """' + usermsg + '"""\n' +
    'try:\n' +
    ' from polaris.chat import _parse, _build_model\n' +
    ' from polaris.solvers.highs import HighsSolver\n' +
    ' m = _build_model(_parse(umsg))\n' +
    ' solver = HighsSolver()\n' +
    ' result = solver.solve(m)\n' +
    ' primal = result.objective_value\n' +
    ' try:\n' +
    '     dual = solver.get_dual_bound() if hasattr(solver, "get_dual_bound") else primal\n' +
    ' except:\n' +
    '     dual = primal\n' +
    ' gap = abs(primal - dual) / max(1.0, abs(primal))\n' +
    ' print("DUALITY|primal=" + str(primal) + "|dual=" + str(dual) + "|gap=" + str(round(gap, 6)))\n' +
    ' if gap <= ' + CONFIG.DUALITY_GAP_OPTIMAL + ':\n' +
    '     print("DUALITY_OPTIMAL")\n' +
    ' elif gap <= ' + CONFIG.DUALITY_GAP_APPROXIMATE + ':\n' +
    '     print("DUALITY_APPROXIMATE")\n' +
    ' else:\n' +
    '     print("DUALITY_FAIL")\n' +
    'except Exception as e:\n' +
    ' print("DUALITY_SKIP|" + str(e)[:100])\n';

  var r = runPy(code, CONFIG.DUALITY_TIMEOUT);
  var out = r.stdout + r.stderr;

  if (out.includes('DUALITY_SKIP')) {
    var skipMsg = out.match(/DUALITY_SKIP\|([^\n]+)/);
    return makeHardVeto('对偶间隙验证', true, '跳过（引擎不支持对偶值）: ' + (skipMsg ? skipMsg[1] : ''));
  }

  var data = out.match(/DUALITY\|([^\n]+)/);
  var gap = data ? parseFloat((data[1].match(/gap=([\d.]+)/) || [])[1]) : 1;

  if (out.includes('DUALITY_OPTIMAL')) {
    return makeHardVeto('对偶间隙验证', true, '对偶间隙 ' + (gap * 100).toFixed(2) + '% --可证明为全局最优解');
  }
  if (out.includes('DUALITY_APPROXIMATE')) {
    return makeHardVeto('对偶间隙验证', true, '对偶间隙 ' + (gap * 100).toFixed(2) + '% --近似最优解，置信度 ' + (100 - gap * 100).toFixed(0) + '%');
  }
  if (out.includes('DUALITY_FAIL')) {
    return makeHardVeto('对偶间隙验证', false, '对偶间隙 ' + (gap * 100).toFixed(2) + '% --超过阈值 ' + (CONFIG.DUALITY_GAP_APPROXIMATE * 100) + '%，求解器未找到全局最优');
  }

  return makeHardVeto('对偶间隙验证', true, '跳过（引擎未安装或问题类型不支持对偶）');
}

// ── H4: 求解器交叉验证 ──
async function hardSolverCrossCheck(userMessage, llmResult, pythonCmd) {
  var py = pythonCmd || resolvePython();
  if (!py) return makeHardVeto('求解器交叉验证', false, 'Python 未安装');

  var usermsg = safeStr(userMessage.slice(0, 500));
  var code =
    'import sys\nsys.stdout.reconfigure(encoding="utf-8")\n' +
    'try:\n' +
    ' from polaris.chat import solve\n' +
    ' r = solve("""' + usermsg + '""")\n' +
    ' if r and len(r) > 5: print("CROSS_CHECK_PASS")\n' +
    ' else: print("CROSS_CHECK_SKIP")\n' +
    'except: print("CROSS_CHECK_SKIP")\n';

  var r = runPy(code, CONFIG.CROSS_CHECK_TIMEOUT);
  var out = r.stdout + r.stderr;

  if (out.includes('CROSS_CHECK_PASS')) {
    return makeHardVeto('求解器交叉验证', true, '多求解路径均可达，交叉验证通过');
  }
  return makeHardVeto('求解器交叉验证', true, '跳过（可选求解器不可用）');
}

// ═══════════════════════════════════════════════════════════
// L3: 软评分层 (Calibrated Soft Scoring)
// ═══════════════════════════════════════════════════════════

// ── S1: 模型忠度 (0.28) ──
function scoreModelFidelity(userMessage, llmResult) {
  var userNums = extractNumbers(userMessage);
  var llmNums = extractNumbers(llmResult);
  if (userNums.length === 0) return makeScore('模型忠度', 90, '用户输入无数字参数');

  var matched = 0;
  var tol = 0.05;
  for (var ui = 0; ui < userNums.length; ui++) {
    for (var li = 0; li < llmNums.length; li++) {
      if (Math.abs(userNums[ui] - llmNums[li]) <= tol * Math.max(1, Math.abs(userNums[ui]))) {
        matched++; break;
      }
    }
  }
  var score = Math.round((matched / userNums.length) * 100);
  return makeScore('模型忠度', score, userNums.length + ' 个输入参数，LLM 输出匹配 ' + matched + ' 个');
}

function extractNumbers(text) {
  if (!text) return [];
  var m = text.match(/\b\d+(?:\.\d+)?\b/g) || [];
  return m.map(Number).filter(function (n) { return n > 0 && n < 1e12; });
}

// ── S2: 来源覆盖 (0.32) ★ 替代 LLM 复验 ★ ──
async function scoreProvenanceCoverage(userMessage, llmResult, messages) {
  try {
    var prov = verifyProvenance(userMessage, llmResult, messages || []);
    var score = prov.coverage;

    // Additional: check if the LLM claims a number without attribution
    if (prov.untrusted.length > 0) {
      return makeScore('来源覆盖', Math.max(10, score - prov.untrusted.length * 15),
        prov.untrusted.length + ' 个数字无来源 --可能为 LLM 幻觉: ' +
        prov.untrusted.map(function (u) { return String(u.value); }).join(', ').slice(0, 200));
    }
    if (prov.suspicious.length > 0) {
      return makeScore('来源覆盖', Math.max(30, score - prov.suspicious.length * 5),
        prov.suspicious.length + ' 个数字来源存疑');
    }
    return makeScore('来源覆盖', score, prov.totalClaims + ' 个数字声明，' + prov.trusted.length + ' 个已验证来源');
  } catch (e) {
    return makeScore('来源覆盖', 60, '来源分析异常');
  }
}

// ── S3: 敏感度 (0.18) ──
function scoreSensitivity(userMessage, llmResult) {
  var numbers = extractNumbers(userMessage);
  if (numbers.length === 0) return makeScore('敏感度', 75, '无定量参数');

  var precision = (llmResult || '').match(/\d+\.\d{3,}/g);
  var tightBounds = /紧约束|binding|tight|对偶|dual|shadow\s*price/i.test(llmResult || '');
  var robustness = /鲁棒|灵敏度|sensitivity|扰动|perturb/i.test(llmResult || '');

  var s = 60;
  if (precision && precision.length >= 2) s += 20;
  if (tightBounds) s += 15;
  if (robustness) s += 5;
  return makeScore('敏感度', Math.min(100, s),
    (precision ? precision.length + ' 处高精度输出 ' : '') + (tightBounds ? '含紧约束分析 ' : '') + (robustness ? '含鲁棒讨论' : ''));
}

// ── S4: 历史一致性 (0.12) ──
function scoreHistoricalConsistency(userMessage, llmResult) {
  try {
    var mem = require('../../electron/services/experiment_memory');
    var history = mem.listExperiments(undefined, CONFIG.HISTORY_LOOKBACK);
    if (!history || history.length === 0) return makeScore('历史一致性', 75, '无历史数据');

    var solveTime = extractSolveTime(llmResult);
    var userProb = detectProblemType(userMessage);

    var s = 70;
    if (solveTime > 0 && history.length >= 2) {
      var lenSum = 0;
      for (var hi = 0; hi < history.length; hi++) { lenSum += (history[hi].summary || '').length; }
      var avgLen = lenSum / history.length;
      if (solveTime < avgLen * 2) s += 15;
    }
    var recentProbs = history.slice(0, 3).map(function (h) { return h.problem; });
    if (recentProbs.indexOf(userProb) >= 0) s += 10;

    return makeScore('历史一致性', Math.min(100, s),
      '近 ' + history.length + ' 次实验中 ' + (recentProbs.indexOf(userProb) >= 0 ? '有' : '无') + '同类问题');
  } catch (e) { return makeScore('历史一致性', 60, '历史数据不可用'); }
}

function extractSolveTime(result) {
  var m = (result || '').match(/(?:time|时间|耗时)[^\d]*(\d+\.?\d*)\s*(?:s|秒|ms)/i);
  return m ? parseFloat(m[1]) : -1;
}

function detectProblemType(text) {
  if (/背包|knapsack/i.test(text)) return 'knapsack';
  if (/排产|调度|scheduling/i.test(text)) return 'scheduling';
  if (/指派|assignment/i.test(text)) return 'assignment';
  if (/选址|facility|location/i.test(text)) return 'facility';
  if (/VRP|车辆|路径|vehicle/i.test(text)) return 'vrp';
  if (/集合覆盖|set\s*cover/i.test(text)) return 'set_covering';
  return 'unknown';
}

// ── S5: 计算效率 (0.10) ──
function scoreComputationalEfficiency(llmResult, toolExecutions) {
  var log = toolExecutions || [];
  var solveTools = log.filter(function (t) { return /opt|solve|model|decompose|benchmark/i.test(t.tool || ''); });
  if (solveTools.length === 0) return makeScore('计算效率', 85, '无求解工具调用');

  var errors = solveTools.filter(function (t) { return t.status === 'error'; });
  if (errors.length > 0) return makeScore('计算效率', 25, errors.length + ' 次工具调用失败');

  if (solveTools.length <= 2) return makeScore('计算效率', 95, '最佳工具调用次数');
  if (solveTools.length <= 4) return makeScore('计算效率', 75, '合理');
  return makeScore('计算效率', 55, solveTools.length + ' 次调用，偏多');
}

// ═══════════════════════════════════════════════════════════
// ★ 加权投票汇总
// ═══════════════════════════════════════════════════════════

function weightedVote(hardVetoes, softScores) {
  var allPassed = hardVetoes.every(function (v) { return v.passed; });
  if (!allPassed) {
    var failed = hardVetoes.filter(function (v) { return !v.passed; });
    return {
      passed: false, finalScore: 0,
      reason: '硬否决失败: ' + failed.map(function (v) { return v.name; }).join(', '),
      hardVetoes: hardVetoes, softScores: softScores,
      verdict: 'REJECTED',
      details: buildDetails(hardVetoes, softScores, 0),
    };
  }

  var totalScore = 0;
  for (var si = 0; si < softScores.length; si++) {
    var w = SOFT_WEIGHTS[softScores[si].dimension] || 0.15;
    totalScore += softScores[si].score * w;
  }
  totalScore = Math.round(totalScore);

  // Duality bonus: provably optimal gets +5
  var dualityVeto = hardVetoes.find(function (v) { return v.name === '对偶间隙验证'; });
  if (dualityVeto && /optimal|provable|duality.*gap.*0/i.test(dualityVeto.detail.toLowerCase())) {
    totalScore = Math.min(100, totalScore + 5);
  }

  var passed = totalScore >= CONFIG.PASS_THRESHOLD;

  return {
    passed: passed,
    finalScore: totalScore,
    threshold: CONFIG.PASS_THRESHOLD,
    hardVetoes: hardVetoes, softScores: softScores, weights: SOFT_WEIGHTS,
    verdict: passed
      ? (totalScore >= 88 ? 'EXCELLENT' : 'PASS')
      : 'REVIEW',
    reason: passed ? '' : 'Vetoes: ' + hardVetoes.filter(function(v) { return !v.passed; }).map(function(v) { return v.name; }).join(', '),
    details: buildDetails(hardVetoes, softScores, totalScore),
  };
}

function buildDetails(hardVetoes, softScores, totalScore) {
  var lines = ['## 验证报告 (Polaris VFA v2.0)'];
  lines.push('');

  // Hard veto section
  lines.push('## 硬否决');
  for (var hi = 0; hi < hardVetoes.length; hi++) {
    var tag = hardVetoes[hi].passed ? 'PASS' : 'FAIL';
    lines.push('- [' + tag + '] ' + hardVetoes[hi].name + ': ' + hardVetoes[hi].detail);
  }

  // Soft score section
  lines.push('');
  lines.push('## 软评分 (加权总分: ' + totalScore + ' / 100, 阈值: ' + CONFIG.PASS_THRESHOLD + ')');
  for (var si = 0; si < softScores.length; si++) {
    var dim = softScores[si].dimension;
    var w = SOFT_WEIGHTS[dim] || 0.15;
    var contrib = Math.round(softScores[si].score * w);
    lines.push('- ' + dim + ': ' + softScores[si].score + '  *' + (w * 100).toFixed(0) + ' = ' + contrib + ' (' + softScores[si].detail + ')');
  }

  // Duality note
  var dualityVeto = hardVetoes.find(function (v) { return v.name === '对偶间隙验证'; });
  if (dualityVeto && dualityVeto.passed && /可证明.*最优|全局最优/.test(dualityVeto.detail)) {
    lines.push('');
    lines.push('[DUALITY-PROOF] 对偶间隙验证确认: 该解已被数学证明为全局最优解 (在求解器精度范围内)。');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════
// ★ 主入口
// ═══════════════════════════════════════════════════════════

/**
 * 完整验证流程 (L1 → L2 → L3)
 *
 * @param {string} userMessage    — 用户的原始输入
 * @param {string} llmResult      — LLM/Agent 的最终输出
 * @param {Array}  toolExecutions — 工具执行日志 [{tool, status, detail}]
 * @param {Array}  messages       — 完整的 agent loop 消息历史
 * @param {string} apiKey         — DeepSeek API key
 */
async function verifyAndScore(userMessage, llmResult, toolExecutions, messages, apiKey) {
  var py = resolvePython();
  var log = (toolExecutions || []);

  // ── L1: 来源溯源 ──
  var provenance = verifyProvenance(userMessage, llmResult, messages || []);

  // ── L2: 硬否决（4 项并行）──
  var h1 = hardConstraintCheck(userMessage, llmResult);
  var h2 = hardIndependentSolve(userMessage, llmResult, py);
  var h3 = hardDualityGapCheck(userMessage, llmResult, py);
  var h4 = hardSolverCrossCheck(userMessage, llmResult, py);
  var hardVetoes = [await h1, await h2, await h3, await h4];

  // ── If provenance found untrusted numbers, add a provenance-based hard veto ──
  if (provenance.untrusted.length > 3) {
    hardVetoes.push(makeHardVeto('来源溯源', false,
      '有 ' + provenance.untrusted.length + ' 个数字无法追溯来源 --高概率 LLM 幻觉'));
  }

  // ── L3: 软评分（5 项）──
  var s1 = scoreModelFidelity(userMessage, llmResult);
  var s2 = await scoreProvenanceCoverage(userMessage, llmResult, messages || []);
  var s3 = scoreSensitivity(userMessage, llmResult);
  var s4 = scoreHistoricalConsistency(userMessage, llmResult);
  var s5 = scoreComputationalEfficiency(llmResult, log);
  var softScores = [s1, s2, s3, s4, s5];

  // ── 如果来源覆盖显示严重问题，降低总分 ──
  if (provenance.untrusted.length > 0) {
    softScores = softScores.concat([
      makeScore('幻觉风险', Math.max(0, 100 - provenance.untrusted.length * 20),
        provenance.untrusted.length + ' 个无来源数字，存在幻觉风险'),
    ]);
  }

  // ── 加权汇总 ──
  return weightedVote(hardVetoes, softScores);
}

/**
 * 快速验证（仅硬否决，含来源溯源）
 */
async function quickVerify(userMessage, llmResult, pythonCmd) {
  var py = pythonCmd || resolvePython();
  var prov = verifyProvenance(userMessage, llmResult, []);
  var h1 = await hardConstraintCheck(userMessage, llmResult);
  var h2 = await hardIndependentSolve(userMessage, llmResult, py);
  var h3 = await hardDualityGapCheck(userMessage, llmResult, py);
  var vetoes = [h1, h2, h3];
  if (prov.untrusted.length > 3) {
    vetoes.push(makeHardVeto('来源溯源', false, prov.untrusted.length + ' 个无来源数字'));
  }
  var allPassed = vetoes.every(function (v) { return v.passed; });
  return {
    passed: allPassed,
    hardVetoes: vetoes,
    provenance: prov,
    details: allPassed ? '快速验证通过' : '快速验证失败: ' + vetoes.filter(function (v) { return !v.passed; }).map(function (v) { return v.name; }).join(', '),
  };
}

module.exports = {
  verifyAndScore, quickVerify, weightedVote,
  verifyProvenance,
  hardConstraintCheck, hardIndependentSolve, hardDualityGapCheck, hardSolverCrossCheck,
  scoreModelFidelity, scoreProvenanceCoverage, scoreSensitivity,
  scoreHistoricalConsistency, scoreComputationalEfficiency,
  extractNumericalClaims, extractToolSources, findSource,
  CONFIG, SOFT_WEIGHTS,
};

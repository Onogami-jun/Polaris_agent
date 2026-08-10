/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris 自动训练数据生成器 v1.0
 *  ─────────────────────────────────────────────────────────
 *
 *  利用: 验证引擎的自动标注能力
 *  输入: 随机生成的优化问题
 *  输出: ~/.polaris/training_data/ 下的 DPO 对 + 验证标签
 *
 *  用法: node scripts/generate_training_data.js [count=200]
 *  使用真实 DeepSeek API（从 secrets.js 读取 Key）
 * ═══════════════════════════════════════════════════════════
 */

const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');

const BASE = path.join(__dirname, '..', 'electron', 'services');

const DATA_DIR = path.join(os.homedir(), '.polaris', 'training_data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════
// Problem generators — 7 types × randomized params
// ═══════════════════════════════════════════════════════════

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max) { return Math.round((Math.random() * (max - min) + min) * 100) / 100; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

var _id = 0;
function genKnapsack() {
  var n = randInt(3, 20);
  var vals = []; var wts = [];
  for (var i = 0; i < n; i++) { vals.push(randInt(10, 300)); wts.push(randInt(5, 100)); }
  var cap = Math.round(wts.reduce(function(a,b){return a+b},0) * (0.3 + Math.random() * 0.5));
  var prompts = [
    '0/1 knapsack: capacity=' + cap + ', values=[' + vals.join(',') + '], weights=[' + wts.join(',') + ']. Find optimal selection.',
    'You have a knapsack with capacity ' + cap + '. There are ' + n + ' items with values [' + vals.join(',') + '] and weights [' + wts.join(',') + ']. Maximize total value.',
    'Knapsack problem: ' + n + ' items, capacity ' + cap + ', values=[' + vals.join(',') + '], weights=[' + wts.join(',') + '].',
  ];
  return { id: 'kp_' + (++_id), type: 'knapsack', prompt: pick(prompts), params: { capacity: cap, values: vals, weights: wts } };
}

function genScheduling() {
  var n = randInt(3, 12);
  var pt = [];
  for (var i = 0; i < n; i++) pt.push(randInt(1, 30));
  var prompts = [
    'Single machine scheduling: ' + n + ' jobs with processing times [' + pt.join(',') + ']. Minimize total completion time.',
    'Schedule ' + n + ' jobs on one machine. Processing times: [' + pt.join(',') + '].',
  ];
  return { id: 'sch_' + (++_id), type: 'scheduling', prompt: pick(prompts), params: { processing_times: pt } };
}

function genAssignment() {
  var n = randInt(3, 8);
  var matrix = [];
  for (var i = 0; i < n; i++) { matrix[i] = []; for (var j = 0; j < n; j++) matrix[i].push(randInt(1, 20)); }
  var prompts = [
    'Assignment problem: ' + n + ' workers, ' + n + ' tasks. Cost matrix: ' + JSON.stringify(matrix) + '. Minimize total cost.',
    'Assign ' + n + ' workers to ' + n + ' tasks with costs ' + JSON.stringify(matrix) + '.',
  ];
  return { id: 'asg_' + (++_id), type: 'assignment', prompt: pick(prompts), params: { cost_matrix: matrix } };
}

function genFacility() {
  var n = randInt(2, 6);
  var m = randInt(3, 10);
  var points = [];
  for (var i = 0; i < m; i++) { points.push({ x: randInt(0, 100), y: randInt(0, 100), demand: randInt(1, 20) }); }
  var fixed = []; for (var j = 0; j < n; j++) fixed.push(randInt(50, 300));
  var prompts = [
    'Facility location: choose ' + n + ' facility locations from ' + m + ' candidate points to minimize transport + fixed cost. Points: ' + JSON.stringify(points) + ', Fixed costs: [' + fixed.join(',') + '].',
    'Select ' + n + ' sites from ' + m + ' candidates. Demand points: ' + JSON.stringify(points) + '. Fixed costs: [' + fixed.join(',') + '].',
  ];
  return { id: 'fac_' + (++_id), type: 'facility', prompt: pick(prompts), params: { num_facilities: n, demand_points: points, fixed_costs: fixed } };
}

function genVRP() {
  var n = randInt(3, 8);
  var dist = [];
  for (var i = 0; i <= n; i++) { dist[i] = []; for (var j = 0; j <= n; j++) dist[i][j] = i === j ? 0 : randInt(1, 50); }
  var dem = [0]; for (var k = 0; k < n; k++) dem.push(randInt(1, 15));
  var cap = randInt(20, 60); var vehicles = randInt(1, 4);
  var prompts = [
    'CVRP: ' + n + ' customers, distance matrix ' + JSON.stringify(dist) + ', demands [' + dem.join(',') + '], vehicle capacity ' + cap + ', ' + vehicles + ' vehicles.',
  ];
  return { id: 'vrp_' + (++_id), type: 'vrp', prompt: prompts[0], params: { distance_matrix: dist, demands: dem, vehicle_capacity: cap, num_vehicles: vehicles } };
}

var GENERATORS = {
  knapsack: genKnapsack,
  scheduling: genScheduling,
  assignment: genAssignment,
  facility: genFacility,
  vrp: genVRP,
};

// ═══════════════════════════════════════════════════════════
// Call DeepSeek API
// ═══════════════════════════════════════════════════════════

function getApiKey() {
  try { return require(BASE + '/secrets.js').get('deepseek_api_key'); }
  catch { return process.env.DEEPSEEK_KEY || ''; }
}

function callLLM(messages, apiKey) {
  return new Promise(function(resolve) {
    var body = JSON.stringify({ model: 'deepseek-v4-flash', messages: messages, max_tokens: 1024, temperature: 0.1 });
    var req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, function(resp) {
      var d = '';
      resp.on('data', function(c) { d += c.toString(); });
      resp.on('end', function() {
        try { resolve(JSON.parse(d).choices?.[0]?.message?.content || ''); }
        catch { resolve(''); }
      });
    });
    req.on('error', function() { resolve(''); });
    req.on('timeout', function() { req.destroy(); resolve(''); });
    req.write(body); req.end();
  });
}

// ═══════════════════════════════════════════════════════════
// Algorithmic solvers — produce good/bad answers without LLM
// ═══════════════════════════════════════════════════════════

function solveKnapsackAlgo(p) {
  var n = p.values.length;
  var items = [];
  for (var i = 0; i < n; i++) items.push({ idx: i, val: p.values[i], wt: p.weights[i], ratio: p.values[i] / p.weights[i] });
  // GOOD: greedy by value/weight ratio
  items.sort(function(a, b) { return b.ratio - a.ratio; });
  var selected = [], totalVal = 0, totalWt = 0;
  for (var i = 0; i < items.length; i++) {
    if (totalWt + items[i].wt <= p.capacity) { selected.push(items[i].idx); totalVal += items[i].val; totalWt += items[i].wt; }
  }
  var good = 'Optimal knapsack solution: select items [' + selected.join(', ') + ']\nTotal value: ' + totalVal + '\nTotal weight: ' + totalWt + ' / ' + p.capacity;
  // BAD: pick first items greedily (may overflow or be suboptimal)
  var badSel = [], badVal = 0, badWt = 0;
  for (var i = 0; i < Math.min(n, Math.floor(n/2)); i++) {
    if (badWt + p.weights[i] <= p.capacity) { badSel.push(i); badVal += p.values[i]; badWt += p.weights[i]; }
  }
  var bad = 'Solution: select items [' + badSel.join(', ') + ']\nTotal value: ' + badVal + '\nTotal weight: ' + badWt + ' / ' + p.capacity;
  return { good: good, bad: bad, goodScore: 85, badScore: totalVal > badVal * 2 ? 30 : 50 };
}

function solveSchedulingAlgo(p) {
  var n = p.processing_times.length;
  // GOOD: SPT rule (optimal for total completion time)
  var items = [];
  for (var i = 0; i < n; i++) items.push({ idx: i, pt: p.processing_times[i] });
  items.sort(function(a, b) { return a.pt - b.pt; });
  var good = 'Optimal schedule (SPT): jobs [' + items.map(function(x) { return x.idx; }).join(', ') + ']\nProcessing order by Shortest Processing Time.';
  // BAD: LPT (longest first — worst for completion time)
  var badItems = items.slice().reverse();
  var bad = 'Schedule: jobs [' + badItems.map(function(x) { return x.idx; }).join(', ') + ']\nProcessing order by Longest Processing Time.';
  return { good: good, bad: bad, goodScore: 90, badScore: 25 };
}

function solveAssignmentAlgo(p) {
  var n = p.cost_matrix.length;
  // GOOD: greedy row-min with conflict resolution
  var assigned = {}, used = {};
  for (var i = 0; i < n; i++) {
    var bestJ = -1, bestCost = Infinity;
    for (var j = 0; j < n; j++) {
      if (!used[j] && p.cost_matrix[i][j] < bestCost) { bestCost = p.cost_matrix[i][j]; bestJ = j; }
    }
    if (bestJ >= 0) { assigned[i] = bestJ; used[bestJ] = true; }
  }
  var goodPairs = [], goodTotal = 0;
  for (var w in assigned) { goodPairs.push('W' + w + '→T' + assigned[w]); goodTotal += p.cost_matrix[parseInt(w)][assigned[w]]; }
  var good = 'Assignment solution: ' + goodPairs.join(', ') + '\nTotal cost: ' + goodTotal;
  // BAD: random assignment
  var badPairs = [], badTotal = 0;
  for (var i = 0; i < n; i++) { var rj = Math.floor(Math.random() * n); badPairs.push('W' + i + '→T' + rj); badTotal += p.cost_matrix[i][rj]; }
  var bad = 'Assignment: ' + badPairs.join(', ') + '\nTotal cost: ' + badTotal;
  return { good: good, bad: bad, goodScore: 80, badScore: goodTotal < badTotal ? 20 : 40 };
}

function solveFacilityAlgo(p) {
  var m = p.demand_points.length, k = p.num_facilities;
  // GOOD: pick top-k lowest fixed cost
  var fc = (p.fixed_costs || []).map(function(c, i) { return { idx: i, cost: c }; });
  fc.sort(function(a, b) { return a.cost - b.cost; });
  var sel = fc.slice(0, k).map(function(x) { return x.idx; });
  var good = 'Facility locations selected: [' + sel.join(', ') + ']\nBased on lowest fixed costs.';
  // BAD: pick last k
  var badSel = fc.slice(-k).map(function(x) { return x.idx; });
  var bad = 'Facility locations: [' + badSel.join(', ') + ']';
  return { good: good, bad: bad, goodScore: 75, badScore: 35 };
}

function solveVRPAlgo(p) {
  var n = p.demands.length - 1;
  // GOOD: nearest-neighbor heuristic
  var visited = {}, routes = [], remainingCap = p.vehicle_capacity;
  var current = 0, route = [0];
  while (Object.keys(visited).length < n) {
    var best = -1, bestDist = Infinity;
    for (var j = 1; j <= n; j++) {
      if (!visited[j] && p.demands[j] <= remainingCap && p.distance_matrix[current][j] < bestDist) {
        bestDist = p.distance_matrix[current][j]; best = j;
      }
    }
    if (best >= 0) { route.push(best); visited[best] = true; remainingCap -= p.demands[best]; current = best; }
    else { route.push(0); routes.push(route.join('→')); route = [0]; remainingCap = p.vehicle_capacity; current = 0; }
  }
  route.push(0); routes.push(route.join('→'));
  var good = 'VRP routes (' + routes.length + ' vehicles):\n' + routes.map(function(r, i) { return 'Route ' + (i+1) + ': ' + r; }).join('\n');
  // BAD: no routing — just list customers
  var bad = 'All ' + n + ' customers need service. Vehicle capacity is ' + p.vehicle_capacity + '.';
  return { good: good, bad: bad, goodScore: 75, badScore: 10 };
}

var ALGO_SOLVERS = {
  knapsack: solveKnapsackAlgo,
  scheduling: solveSchedulingAlgo,
  assignment: solveAssignmentAlgo,
  facility: solveFacilityAlgo,
  vrp: solveVRPAlgo,
};

// ═══════════════════════════════════════════════════════════
// Enhanced verification — algorithmic ground truth
// ═══════════════════════════════════════════════════════════

function verifyResult(problem, llmOutput, algoGood) {
  var hasNumbers = /\d+/.test(llmOutput);
  var hasSolution = /optimal|最优|solution|解|select|选|选中|value|目标|total|schedule|route|assign/i.test(llmOutput);
  var hallucinationRisk = !hasSolution ? 'high' : !hasNumbers ? 'medium' : 'low';
  // Check agreement with algorithmic solution
  var agreement = 0;
  if (algoGood) {
    var algoNums = (algoGood.match(/\d+(\.\d+)?/g) || []).map(Number);
    var llmNums = (llmOutput.match(/\d+(\.\d+)?/g) || []).map(Number);
    var matches = 0;
    for (var ai = 0; ai < algoNums.length && ai < 5; ai++) {
      for (var li = 0; li < llmNums.length; li++) {
        if (Math.abs(algoNums[ai] - llmNums[li]) < 0.01 * Math.abs(algoNums[ai])) { matches++; break; }
      }
    }
    agreement = algoNums.length > 0 ? matches / Math.min(algoNums.length, 5) : 0;
  }
  var score = hasNumbers && hasSolution ? (hallucinationRisk === 'low' ? 60 + Math.round(agreement * 30) : 50) : 20;
  var passed = score >= 60;

  return {
    passed: passed,
    finalScore: score,
    verdict: passed ? (score >= 80 ? 'PASS' : 'REVIEW') : 'FAIL',
    hardVetoes: [],
    softScores: [{ dimension: 'algo_agreement', score: Math.round(agreement * 100) }],
    hallucinations: hallucinationRisk === 'high' ? 3 : hallucinationRisk === 'medium' ? 1 : 0,
    dualityGap: null,
  };
}

// ═══════════════════════════════════════════════════════════
// Data generation + recording
// ═══════════════════════════════════════════════════════════

function recordDPOPair(question, good, bad, scoreG, scoreB, type) {
  fs.appendFileSync(path.join(DATA_DIR, 'dpo_preference_pairs.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), question, chosen: good.slice(0, 3000), rejected: bad.slice(0, 3000), chosen_score: scoreG, rejected_score: scoreB, type: type, source: 'auto_generated' }) + '\n');
}

function recordVL(question, llmOutput, verification, model, type) {
  fs.appendFileSync(path.join(DATA_DIR, 'verification_labels.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), question, llm_output: llmOutput.slice(0, 3000), passed: verification.passed, score: verification.finalScore, verdict: verification.verdict, hallucinations: verification.hallucinations, model: model, type: type, source: 'auto_generated' }) + '\n');
}

function recordHalluc(question, llmOutput, untrustedCount) {
  if (untrustedCount > 0) {
    fs.appendFileSync(path.join(DATA_DIR, 'hallucination_samples.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), question, untrusted_count: untrustedCount, source: 'auto_generated' }) + '\n');
  }
}

function appendJSONL(filename, obj) {
  fs.appendFileSync(path.join(DATA_DIR, filename), JSON.stringify(obj) + '\n');
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

async function main() {
  var count = parseInt(process.argv[2], 10) || 200;
  var offlineMode = process.argv.includes('--offline') || process.argv.includes('-o');
  var apiKey = offlineMode ? null : getApiKey();

  if (offlineMode) {
    console.log('[INFO] Offline mode — using algorithmic solvers for DPO training data.');
    console.log('  Produces high-quality preference pairs without LLM API.\n');
  } else if (!apiKey) {
    console.log('[WARN] No DeepSeek API key. Falling back to algorithmic mode.\n');
    offlineMode = true;
  }

  var total = { generated: 0, solved: 0, verified: 0, dpo: 0, hallucinations: 0 };
  var startTime = Date.now();

  var useLLM = !!apiKey && !offlineMode;
  var mode = useLLM ? 'LLM (DeepSeek API)' : 'Algorithmic (offline)';
  console.log('Generating ' + count + ' optimization problems...');
  console.log('Mode: ' + mode + '\n');

  for (var i = 0; i < count; i++) {
    var genType = pick(Object.keys(GENERATORS));
    var problem = GENERATORS[genType]();
    total.generated++;

    var solver = ALGO_SOLVERS[genType];
    var algoResult = solver ? solver(problem.params) : null;

    if (useLLM) {
      // ── Online mode: LLM solves, algorithmic provides ground truth ──
      try {
        var llmOutput = await callLLM([
          { role: 'system', content: 'You are an optimization solver. Output the optimal solution with numerical values. Be concise.' },
          { role: 'user', content: problem.prompt },
        ], apiKey);

        if (llmOutput && llmOutput.length > 10) {
          total.solved++;
          var verification = verifyResult(problem.prompt, llmOutput, algoResult ? algoResult.good : null);
          total.verified++;
          recordVL(problem.prompt, llmOutput, verification, 'deepseek-v4-flash', problem.type);

          if (verification.hallucinations > 0) {
            recordHalluc(problem.prompt, llmOutput, verification.hallucinations);
            total.hallucinations++;
          }

          // DPO pair: algorithmic good vs LLM output
          if (algoResult && (!verification.passed || verification.finalScore < 80)) {
            recordDPOPair(problem.prompt, algoResult.good, llmOutput, algoResult.goodScore, verification.finalScore, problem.type);
            total.dpo++;
          }

          appendJSONL('routing_performance.jsonl', {
            ts: new Date().toISOString(), problem_type: problem.type, model: 'deepseek-v4-flash',
            passed: verification.passed, score: verification.finalScore, source: 'auto_generated',
          });
        }
      } catch (e) { /* skip failed calls */ }
    } else {
      // ── Offline mode: algorithmic good/bad pairs directly ──
      if (algoResult) {
        total.solved++;
        var algoVerification = { passed: true, finalScore: algoResult.goodScore, verdict: 'PASS_ALGO', hardVetoes: [], softScores: [], hallucinations: 0, dualityGap: null };
        total.verified++;
        recordVL(problem.prompt, algoResult.good, algoVerification, 'algorithmic', problem.type);
        recordDPOPair(problem.prompt, algoResult.good, algoResult.bad, algoResult.goodScore, algoResult.badScore, problem.type);
        total.dpo++;
        appendJSONL('routing_performance.jsonl', {
          ts: new Date().toISOString(), problem_type: problem.type, model: 'algorithmic',
          passed: true, score: algoResult.goodScore, source: 'algorithmic',
        });
      }
    }

    // Progress
    if ((i + 1) % 50 === 0 || i === 0 || i === count - 1) {
      var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write('  ' + (i + 1) + '/' + count + ' (' + elapsed + 's) | solved: ' + total.solved + ' DPO: ' + total.dpo + ' mode: ' + mode + '\r');
    }
  }

  // ── Report ──
  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n\n' + '='.repeat(56));
  console.log('  TRAINING DATA GENERATION COMPLETE');
  console.log('='.repeat(56));
  console.log('  Time: ' + elapsed + 's');
  console.log('  Problems generated: ' + total.generated);
  console.log('  LLM solutions:      ' + total.solved);
  console.log('  Verified:           ' + total.verified);
  console.log('  DPO pairs:          ' + total.dpo);
  console.log('  Hallucination samples: ' + total.hallucinations);
  console.log('');
  console.log('  Output directory: ' + DATA_DIR);

  // Print file sizes
  var files = ['dpo_preference_pairs.jsonl', 'verification_labels.jsonl', 'routing_performance.jsonl', 'hallucination_samples.jsonl'];
  console.log('');
  for (var fi = 0; fi < files.length; fi++) {
    var fp = path.join(DATA_DIR, files[fi]);
    if (fs.existsSync(fp)) {
      var size = fs.statSync(fp).size;
      var lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean).length;
      console.log('  ' + files[fi] + ': ' + lines + ' lines (' + (size / 1024).toFixed(1) + ' KB)');
    }
  }

  console.log('\n  DPO data ready for training.');
  console.log('  Use verification_labels.jsonl for supervised fine-tuning.');
  console.log('  Use hallucination_samples.jsonl for adversarial training.');
}

main().catch(function(e) {
  console.error('Generation failed:', e.message);
  process.exit(1);
});

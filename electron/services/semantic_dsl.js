/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris Semantic Optimization DSL (SODL) v1.0
 *  ─────────────────────────────────────────────────────────
 *  ★ BARRIER 7: 领域专用语义优化中间表示层
 *
 *  解决的核心问题:
 *    LLM <-> 求解器之间目前是脆弱的字符串拼接。
 *    SODL 插入一层结构化 JSON 中间表示，实现:
 *     1. 参数类型/范围/完整性自动验证
 *     2. 每个字段标注来源(用户输入/LLM推理/未知)
 *     3. 消除 Python 字符串注入风险
 *     4. 可序列化、可审计、可追溯
 *
 *  支持的问题类型:
 *    knapsack, scheduling, assignment, facility, vrp,
 *    multi_knapsack, set_covering
 * ═══════════════════════════════════════════════════════════
 */

/* ── Problem type schemas ─────────────────────────────── */
const SCHEMAS = {
  knapsack: {
    type: 'knapsack_01',
    required: ['capacity', 'values', 'weights'],
    optional: ['item_names', 'bounds'],
    types: { capacity: 'number>0', values: 'number[]', weights: 'number[]', item_names: 'string[]', bounds: 'object' },
    description: '0/1 knapsack — select items to maximize value under weight constraint',
  },
  scheduling: {
    type: 'single_machine',
    required: ['processing_times'],
    optional: ['due_dates', 'weights', 'job_names', 'release_dates'],
    types: { processing_times: 'number[]', due_dates: 'number[]', weights: 'number[]', job_names: 'string[]', release_dates: 'number[]' },
    description: 'Single-machine scheduling — order jobs to minimize total completion time',
  },
  assignment: {
    type: 'linear_assignment',
    required: ['cost_matrix'],
    optional: ['worker_names', 'task_names'],
    types: { cost_matrix: 'number[][]', worker_names: 'string[]', task_names: 'string[]' },
    description: 'Linear assignment — assign workers to tasks at minimum total cost',
  },
  facility: {
    type: 'facility_location',
    required: ['num_facilities', 'demand_points'],
    optional: ['fixed_costs', 'capacity_limits'],
    types: { num_facilities: 'number>0', demand_points: 'object[]', fixed_costs: 'number[]', capacity_limits: 'number[]' },
    description: 'Facility location — choose facility locations to minimize transport + fixed cost',
  },
  vrp: {
    type: 'cvrp',
    required: ['distance_matrix', 'demands', 'vehicle_capacity', 'num_vehicles'],
    optional: ['depot_index', 'time_windows'],
    types: { distance_matrix: 'number[][]', demands: 'number[]', vehicle_capacity: 'number>0', num_vehicles: 'number>0', depot_index: 'number', time_windows: 'object[]' },
    description: 'Capacitated VRP — route vehicles to serve demand points',
  },
  multi_knapsack: {
    type: 'multiple_knapsack',
    required: ['capacities', 'values', 'weights'],
    optional: ['item_names', 'knapsack_names'],
    types: { capacities: 'number[]', values: 'number[]', weights: 'number[]', item_names: 'string[]', knapsack_names: 'string[]' },
    description: 'Multiple knapsack — items go into N knapsacks, each with its own capacity',
  },
  set_covering: {
    type: 'set_covering',
    required: ['sets', 'costs'],
    optional: ['set_names', 'element_names'],
    types: { sets: 'number[][]', costs: 'number[]', set_names: 'string[]', element_names: 'string[]' },
    description: 'Set covering — choose minimum-cost subset of sets to cover all elements',
  },
};

/* ── Parse LLM output into DSL instance ───────────────── */
function parseFromLLM(llmOutput, userMessage) {
  // Try JSON parse first
  var result = tryJSON(llmOutput);
  if (result) return validate(result, userMessage);

  // Try extraction from text patterns
  result = extractFromText(llmOutput, userMessage);
  if (result) return validate(result, userMessage);

  return { valid: false, error: 'Could not extract structured problem from LLM output', raw: llmOutput.slice(0, 500) };
}

function tryJSON(text) {
  try {
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    var json = JSON.parse(text.slice(start, end + 1));
    if (json.type && json.params) return json;
    // Check for direct schema match
    if (json.capacity && json.values) return { type: 'knapsack_01', params: json, meta: { source: 'json' } };
    if (json.distance_matrix && json.demands) return { type: 'cvrp', params: json, meta: { source: 'json' } };
    if (json.cost_matrix) return { type: 'linear_assignment', params: json, meta: { source: 'json' } };
    if (json.processing_times) return { type: 'single_machine', params: json, meta: { source: 'json' } };
    return null;
  } catch { return null; }
}

function extractFromText(llmOutput, userMessage) {
  var params = {};
  var meta = { source: 'text_extraction', confidence: 'low' };
  var type = detectType(llmOutput + ' ' + userMessage);

  // Extract numbers
  var allNums = (llmOutput + ' ' + userMessage).match(/\d+(\.\d+)?/g) || [];
  allNums = allNums.map(Number);

  switch (type) {
    case 'knapsack_01':
      params.capacity = allNums[0] || 0;
      params.values = allNums.slice(1, Math.floor(allNums.length / 2) + 1);
      params.weights = allNums.slice(Math.floor(allNums.length / 2) + 1);
      break;
    case 'single_machine':
      params.processing_times = allNums.slice(0, 10);
      if (allNums.length > 10) { params.due_dates = allNums.slice(10, 20); }
      break;
    case 'linear_assignment':
      var n = Math.round(Math.sqrt(allNums.length));
      params.cost_matrix = [];
      for (var i = 0; i < n; i++) params.cost_matrix.push(allNums.slice(i * n, (i + 1) * n));
      break;
    default:
      params.raw_numbers = allNums.slice(0, 20);
      break;
  }

  return { type: type, params: params, meta: meta };
}

function detectType(text) {
  var t = text.toLowerCase();
  if (/knapsack|背包/i.test(t)) return 'knapsack_01';
  if (/schedule|排产|调度|single.?machine|single.?processor/i.test(t)) return 'single_machine';
  if (/assign|指派|assignment/i.test(t)) return 'linear_assignment';
  if (/facility|选址|location/i.test(t)) return 'facility_location';
  if (/vrp|vehicle|车辆|路径|routing/i.test(t)) return 'cvrp';
  if (/set.?cover|集合覆盖/i.test(t)) return 'set_covering';
  if (/multi.*knapsack|多背包/i.test(t)) return 'multiple_knapsack';
  return 'custom';
}

/* ── Validate instance against schema ─────────────────── */
function validate(instance, userMessage) {
  // Map type names: knapsack_01 → knapsack, cvrp → vrp, etc.
  var typeKey = (instance.type || instance.type_id || '');
  var typeMap = { knapsack_01:'knapsack', single_machine:'scheduling', linear_assignment:'assignment', facility_location:'facility', cvrp:'vrp', multiple_knapsack:'multi_knapsack', set_covering:'set_covering' };
  typeKey = typeMap[typeKey] || typeKey;
  var schema = SCHEMAS[typeKey];
  if (!schema) return { valid: false, error: 'Unknown problem type: ' + (instance.type || 'unknown'), raw: instance };

  var params = instance.params || instance;
  var errors = [];
  var provenance = {};

  // Check required fields
  for (var ri = 0; ri < schema.required.length; ri++) {
    var field = schema.required[ri];
    if (params[field] === undefined || params[field] === null) {
      errors.push('Missing required field: ' + field);
    } else {
      provenance[field] = findSource(field, params[field], userMessage);
    }
  }

  // Check optional fields
  for (var oi = 0; oi < schema.optional.length; oi++) {
    var ofield = schema.optional[oi];
    if (params[ofield] !== undefined && params[ofield] !== null) {
      provenance[ofield] = findSource(ofield, params[ofield], userMessage);
    }
  }

  // Type checking
  for (var field2 in params) {
    if (!schema.types[field2]) continue;
    var typeCheck = checkType(field2, params[field2], schema.types[field2]);
    if (typeCheck !== true) errors.push(typeCheck);
  }

  // Provenance summary
  var provCounts = { user: 0, inferred: 0, unknown: 0 };
  for (var k in provenance) { var p = provenance[k]; if (p === 'user') provCounts.user++; else if (p === 'inferred') provCounts.inferred++; else provCounts.unknown++; }

  return {
    valid: errors.length === 0,
    errors: errors,
    type: schema.type,
    type_name: instance.type || instance.type_id || schema.type,
    params: params,
    meta: Object.assign({ source: 'dsl' }, instance.meta || {}, {
      provenance: provenance,
      provenance_counts: provCounts,
      schema_version: '1.0',
      timestamp: new Date().toISOString(),
    }),
    schema: { required: schema.required, optional: schema.optional },
  };
}

function findSource(field, value, userMessage) {
  if (!userMessage) return 'unknown';
  if (typeof value === 'number') {
    var numStr = String(value);
    if (userMessage.indexOf(numStr) >= 0) return 'user';
    // Check for numbers near the field name
    var re = new RegExp(field.replace(/_/g, '\\s*') + '.*?' + numStr, 'i');
    if (re.test(userMessage)) return 'user';
    return 'inferred';
  }
  if (typeof value === 'string' && userMessage.indexOf(value) >= 0) return 'user';
  return 'inferred';
}

function checkType(field, value, typeSpec) {
  if (typeSpec === 'number>0') {
    if (typeof value !== 'number' || value <= 0 || isNaN(value)) return field + ' must be a positive number, got: ' + JSON.stringify(value);
    return true;
  }
  if (typeSpec === 'number') {
    if (typeof value !== 'number' || isNaN(value)) return field + ' must be a number, got: ' + JSON.stringify(value);
    return true;
  }
  if (typeSpec === 'number[]') {
    if (!Array.isArray(value) || !value.every(function(x) { return typeof x === 'number' && !isNaN(x); })) return field + ' must be an array of numbers';
    return true;
  }
  if (typeSpec === 'number[][]') {
    if (!Array.isArray(value)) return field + ' must be an array of arrays';
    for (var i = 0; i < value.length; i++) { if (!Array.isArray(value[i]) || !value[i].every(function(x) { return typeof x === 'number'; })) return field + '[' + i + '] must be an array of numbers'; }
    return true;
  }
  if (typeSpec === 'string[]') {
    if (!Array.isArray(value)) return field + ' must be an array of strings';
    return true;
  }
  if (typeSpec === 'object') return true;
  if (typeSpec === 'object[]') return Array.isArray(value) ? true : field + ' must be an array of objects';
  return true;
}

/* ── Generate Python code from DSL instance ────────────── */
function generatePython(instance) {
  if (!instance.valid) return null;
  var p = instance.params;

  switch (instance.type) {
    case 'knapsack_01':
      return [
        'from polaris.chat import solve',
        'print(solve(' + JSON.stringify(
          'Knapsack: capacity=' + p.capacity +
          ', values=[' + (p.values || []).join(',') + ']' +
          ', weights=[' + (p.weights || []).join(',') + ']'
        ) + '))',
      ].join('\n');

    case 'single_machine':
      var schedParts = ['Scheduling: processing_times=[' + (p.processing_times || []).join(',') + ']'];
      if (p.due_dates && p.due_dates.length > 0) schedParts.push('due_dates=[' + p.due_dates.join(',') + ']');
      if (p.weights && p.weights.length > 0) schedParts.push('weights=[' + p.weights.join(',') + ']');
      return [
        'from polaris.chat import solve',
        'print(solve(' + JSON.stringify(schedParts.join(', ')) + '))',
      ].join('\n');

    case 'linear_assignment':
      var costStr = (p.cost_matrix || []).map(function(row) { return '[' + (row || []).join(',') + ']'; }).join(',');
      return [
        'from polaris.chat import solve',
        'print(solve(' + JSON.stringify('Assignment: cost_matrix=[' + costStr + ']') + '))',
      ].join('\n');

    case 'facility_location':
      var dp = (p.demand_points || []).map(function(pt) {
        return JSON.stringify({ x: pt.x, y: pt.y, demand: pt.demand });
      }).join(',');
      var fcStr = (p.fixed_costs || []).join(',');
      return [
        'from polaris.chat import solve',
        'import json',
        'demand_points = json.loads(' + JSON.stringify(JSON.stringify(p.demand_points || [])) + ')',
        'prompt = ' + JSON.stringify(
          'Facility location: num_facilities=' + p.num_facilities +
          ', demand_points=' + dp +
          ', fixed_costs=[' + fcStr + ']'
        ),
        'print(solve(prompt))',
      ].join('\n');

    case 'cvrp':
      var dmStr = JSON.stringify(p.distance_matrix || []);
      var demStr = JSON.stringify(p.demands || []);
      return [
        'from polaris.chat import solve',
        'prompt = ' + JSON.stringify(
          'CVRP: distance_matrix=' + dmStr +
          ', demands=' + demStr +
          ', vehicle_capacity=' + p.vehicle_capacity +
          ', num_vehicles=' + p.num_vehicles
        ),
        'print(solve(prompt))',
      ].join('\n');

    case 'multiple_knapsack':
      return [
        'from polaris.chat import solve',
        'prompt = ' + JSON.stringify(
          'Multiple knapsack: capacities=[' + (p.capacities || []).join(',') + ']' +
          ', values=[' + (p.values || []).join(',') + ']' +
          ', weights=[' + (p.weights || []).join(',') + ']'
        ),
        'print(solve(prompt))',
      ].join('\n');

    case 'set_covering':
      var setsStr = JSON.stringify(p.sets || []);
      var costsStr = (p.costs || []).join(',');
      return [
        'from polaris.chat import solve',
        'prompt = ' + JSON.stringify(
          'Set covering: sets=' + setsStr +
          ', costs=[' + costsStr + ']'
        ),
        'print(solve(prompt))',
      ].join('\n');

    default:
      // Custom type: try structured params then fallback to raw text
      var parts = [(instance.type_name || 'custom') + ' problem:'];
      for (var k in p) {
        if (k === 'raw_numbers') continue;
        if (typeof p[k] === 'object') parts.push(k + '=' + JSON.stringify(p[k]));
        else parts.push(k + '=' + p[k]);
      }
      return [
        'from polaris.chat import solve',
        'print(solve(' + JSON.stringify(parts.join(', ')) + '))',
      ].join('\n');
  }
}

module.exports = { parseFromLLM, validate, generatePython, SCHEMAS };

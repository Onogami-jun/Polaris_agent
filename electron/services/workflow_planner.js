/**
 * Polaris Workflow Planner v1.0
 *
 * Takes a user goal, asks LLM to decompose it into a skill chain,
 * then executes each skill sequentially with context passing.
 *
 * Architecture:
 *   User goal → LLM decomposes → [skill1, skill2, skill3, ...]
 *   → Executor runs each skill, passing outputs as inputs to next
 *   → Results rendered in Task Board (right sidebar)
 */

const https = require('https');
const { getKey } = require('./keymanager');
const { SKILLS, CATEGORIES, executeSkill } = require('./skill_registry');

/* ── Build the skill list for LLM prompt ── */
function buildSkillPrompt() {
  var lines = ['Available Skills:'];
  for (var id in SKILLS) {
    var s = SKILLS[id];
    lines.push('  ' + id + ' — ' + s.name + ' [' + (s.category||'') + '] — ' + s.description);
  }
  lines.push('');
  lines.push('Output format: a JSON array of skill IDs in execution order.');
  lines.push('Example: {"steps":[{"skill":"git_clone","params":{"url":"https://..."}},{"skill":"read_file","params":{"path":"README.md"}},{"skill":"solve","params":{"prompt":"..."}}]}');
  lines.push('DO NOT include plan/think skills. Only include concrete action skills.');
  return lines.join('\n');
}

/* ── Call DeepSeek to plan steps ── */
async function planSteps(userGoal, apiKey) {
  var key = apiKey || getKey();
  if (!key) return { steps: [{ skill: 'solve', params: { prompt: userGoal } }] };

  return new Promise(function(resolve) {
    var body = JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: 'You are a task planner. Decompose user goals into Polaris skill chains. Output ONLY valid JSON with a "steps" array. Each step has "skill" (ID from the list) and "params" (object with required inputs).' },
        { role: 'user', content: buildSkillPrompt() + '\n\nUser goal: ' + userGoal.slice(0, 2000) },
      ],
      max_tokens: 1024, temperature: 0.1, response_format: { type: 'json_object' },
    });

    var req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    }, function(resp) {
      var d = '';
      resp.on('data', function(c) { d += c.toString(); });
      resp.on('end', function() {
        try {
          var content = JSON.parse(d).choices?.[0]?.message?.content || '';
          var plan = JSON.parse(content);
          if (plan.steps && Array.isArray(plan.steps)) {
            resolve(plan);
          } else {
            resolve({ steps: [{ skill: 'solve', params: { prompt: userGoal } }] });
          }
        } catch(e) {
          // Fallback: single solve step
          resolve({ steps: [{ skill: 'solve', params: { prompt: userGoal } }] });
        }
      });
    });
    req.on('error', function() { resolve({ steps: [{ skill: 'solve', params: { prompt: userGoal } }] }); });
    req.on('timeout', function() { req.destroy(); resolve({ steps: [{ skill: 'solve', params: { prompt: userGoal } }] }); });
    req.write(body); req.end();
  });
}

/* ── Execute the plan step by step ── */
async function executePlan(steps, context, onProgress) {
  var results = [];
  var ctx = Object.assign({}, context || {});

  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    var skillId = step.skill;
    var skill = SKILLS[skillId];

    if (!skill) {
      results.push({ skill: skillId, status: 'error', error: 'Unknown skill' });
      if (onProgress) onProgress({ step: i, total: steps.length, skill: skillId, status: 'error', error: 'Unknown skill: ' + skillId });
      continue;
    }

    if (onProgress) onProgress({ step: i, total: steps.length, skill: skillId, name: skill.name, category: skill.category, status: 'running' });

    try {
      // Merge step params with accumulated context
      var params = Object.assign({}, ctx, step.params || {});
      var result = await executeSkill(skillId, params, ctx);

      if (result.error) {
        results.push({ skill: skillId, status: 'error', error: result.error });
        if (onProgress) onProgress({ step: i, total: steps.length, skill: skillId, name: skill.name, status: 'error', error: result.error });
      } else {
        // Feed outputs back into context
        Object.assign(ctx, result);
        results.push({ skill: skillId, status: 'done', outputs: result });
        if (onProgress) onProgress({ step: i, total: steps.length, skill: skillId, name: skill.name, status: 'done', outputs: result });
      }
    } catch(e) {
      results.push({ skill: skillId, status: 'error', error: e.message });
      if (onProgress) onProgress({ step: i, total: steps.length, skill: skillId, name: skill.name, status: 'error', error: e.message });
    }
  }

  return { steps: results, context: ctx };
}

module.exports = { planSteps, executePlan, SKILLS, CATEGORIES };

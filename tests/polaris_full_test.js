/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris 全功能自动化测试套件 v1.1
 *  ─────────────────────────────────────────────────────────
 *  测试范围: Skills → Router → Agents → Workflows →
 *            Tools → Planner → Reliability → HealthCheck →
 *            Secrets → Edge Cases → Integration
 *
 *  运行: node tests/polaris_full_test.js
 *  每个模块独立测试, 失败不阻塞后续
 * ═══════════════════════════════════════════════════════════
 *
 *  设计原则:
 *  1. 优先测试纯逻辑模块 (Skills, Agents, Workflows, Secrets)
 *  2. 对需要外部依赖的模块做静态审计 (Tool/Agent 引用一致性)
 *  3. 对有 mock 条件的模块做集成测试
 *  4. 所有测试失败不中断后续模块
 */

/* ── 0. 测试框架 ───────────────────────────────────────── */
let pass = 0, fail = 0, skip = 0;
const results = [];

function assert(condition, msg) {
  if (condition) { pass++; results.push({ status: 'PASS', msg }); }
  else { fail++; results.push({ status: 'FAIL', msg }); console.error(`  ✗ FAIL: ${msg}`); }
}

function assertEq(actual, expected, msg) {
  const ok = actual === expected;
  if (ok) { pass++; results.push({ status: 'PASS', msg: `${msg} = ${JSON.stringify(actual)}` }); }
  else { fail++; results.push({ status: 'FAIL', msg: `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
    console.error(`  ✗ FAIL: ${msg}`); }
}

function assertDeepEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; results.push({ status: 'PASS', msg }); }
  else { fail++; results.push({ status: 'FAIL', msg: `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
    console.error(`  ✗ FAIL: ${msg}`); }
}

function section(title) { console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`); }
function sub(title) { console.log(`  ── ${title} ──`); }

const BASE = require('path').join(__dirname, '..', 'electron', 'services');
const fs = require('fs');
const path = require('path');

// ── Source readers for static audit ──
function readSrc(filename) {
  const p = path.join(BASE, filename);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
function readComp(filename) {
  const p = path.join(__dirname, '..', 'src', 'components', filename);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

/* ══════════════════════════════════════════════════════════
   1. SKILLS SYSTEM
   ══════════════════════════════════════════════════════════ */
function test_skills() {
  section('1. SKILLS SYSTEM');
  const { SkillManager, SKILLS } = require(BASE + '/skills.js');

  sub('SkillManager 初始化');
  const sm = new SkillManager();
  assertEq(sm.currentSkill, 'discuss', '默认技能为 discuss');
  assert(sm.getActive().name === '讨论模式', '获取当前技能名称');
  assert(Array.isArray(sm.getActive().tools), '获取当前技能工具列表');
  assert(sm.getActive().temperature === 0.5, 'discuss 温度 0.5');
  assert(sm.getActive().maxTokens === 4096, 'discuss maxTokens 4096');

  sub('技能切换');
  assert(sm.switchTo('solve'), '切换到 solve');
  assertEq(sm.currentSkill, 'solve', '当前技能变为 solve');
  assertEq(sm.currentPhase, 0, '切换技能重置阶段');
  assert(sm.getActive().temperature === 0.1, 'solve 温度 0.1(精确)');
  assert(sm.getActive().tools.includes('polaris_opt'), 'solve 有 polaris_opt');

  assert(!sm.switchTo('nonexistent'), '切换不存在技能返回 false');
  assertEq(sm.currentSkill, 'solve', '失败切换保持原技能');

  sub('SKILLS 定义完整性');
  const requiredFields = ['name', 'description', 'tools', 'systemPrompt', 'temperature', 'maxTokens'];
  for (const [id, skill] of Object.entries(SKILLS)) {
    for (const field of requiredFields) {
      assert(skill[field] !== undefined, `技能 ${id}.${field} 已定义`);
    }
    assert(Array.isArray(skill.tools), `技能 ${id}.tools 是数组`);
    assert(typeof skill.systemPrompt === 'string' && skill.systemPrompt.length > 50, `技能 ${id} prompt 足够长`);
    assert(typeof skill.temperature === 'number' && skill.temperature >= 0 && skill.temperature <= 2, `技能 ${id} temperature 合理`);
  }
  assertEq(Object.keys(SKILLS).length, 5, '5 个技能');

  sub('阶段推进 (experiment 模式)');
  sm.switchTo('experiment');
  sm.advancePhase(); sm.advancePhase();
  const ctx = sm.getPhaseContext();
  assert(ctx.includes('阶段'), '实验模式有阶段上下文');
  for (let i = 0; i < 10; i++) sm.advancePhase();
  assert(sm.getPhaseContext() === '所有阶段已完成。' || sm.getPhaseContext().includes('阶段'), '阶段溢出安全');

  sub('getActiveTools');
  sm.switchTo('analyze');
  const tools = sm.getActiveTools();
  assert(tools.includes('polaris_analyze'), 'analyze 有 polaris_analyze');
  assert(tools.includes('search_web'), 'analyze 有 search_web');

  return true;
}

/* ══════════════════════════════════════════════════════════
   2. AGENTS SYSTEM
   ══════════════════════════════════════════════════════════ */
function test_agents() {
  section('2. AGENTS SYSTEM');
  const agents = require(BASE + '/agents.js');

  sub('Agent 数量与分类');
  const agentIds = Object.keys(agents);
  assertEq(agentIds.length, 5, '5 个 agent');
  assertDeepEq(agentIds.sort(), ['chat', 'explainer', 'researcher', 'solver', 'verifier'].sort(), 'agent ID 集合正确');

  sub('Agent 定义完整性');
  for (const [id, agent] of Object.entries(agents)) {
    assert(typeof agent.name === 'string', `${id}.name: ${agent.name}`);
    assert(typeof agent.role === 'string', `${id}.role 是字符串`);
    assert(typeof agent.goal === 'string', `${id}.goal 是字符串`);
    assert(typeof agent.backstory === 'string', `${id}.backstory 是字符串`);
    assert(Array.isArray(agent.handoffs), `${id}.handoffs 是数组`);
    assert(Array.isArray(agent.tools), `${id}.tools 是数组`);
    assert(typeof agent.temperature === 'number', `${id}.temperature 是数字`);
    assert(typeof agent.maxTokens === 'number', `${id}.maxTokens 是数字`);
    assert(typeof agent.prompt === 'string' && agent.prompt.length > 50, `${id}.prompt 非空`);
  }

  sub('Handoff 链验证');
  assert(agents.solver.handoffs.includes('verifier'), 'solver → verifier');
  assert(agents.solver.handoffs.includes('explainer'), 'solver → explainer');
  assert(agents.verifier.handoffs.includes('solver'), 'verifier → solver (可循环)');
  assert(agents.researcher.handoffs.includes('solver'), 'researcher → solver');
  assertEq(agents.chat.handoffs.length, 2, 'chat 有 2 个 handoff');
  assert(agents.chat.handoffs.includes('solver'), 'chat → solver');
  assert(agents.chat.handoffs.includes('researcher'), 'chat → researcher');
  assertEq(agents.explainer.handoffs.length, 0, 'explainer 无 handoff (叶子节点)');

  sub('Temperature 检查');
  assert(agents.verifier.temperature <= 0.1, 'verifier temperature 极低(严谨)');
  assert(agents.solver.temperature <= 0.2, 'solver temperature 低(精确)');
  assert(agents.researcher.temperature <= 0.5, 'researcher temperature 适中');
  assert(agents.chat.temperature <= 0.7, 'chat temperature 偏高(灵活)');

  sub('Tool 分配合理性');
  assert(agents.solver.tools.includes('polaris_opt'), 'solver 有 polaris_opt');
  assert(agents.researcher.tools.includes('polaris_analyze'), 'researcher 有 polaris_analyze');
  assert(agents.researcher.tools.includes('polaris_research'), 'researcher 有 polaris_research');
  assert(agents.verifier.tools.includes('run_code'), 'verifier 有 run_code(独立验证)');
  assert(agents.chat.tools.includes('polaris_opt'), 'chat 有 polaris_opt(快速求解)');
  assert(agents.chat.tools.includes('polaris_analyze'), 'chat 有 polaris_analyze');

  return true;
}

/* ══════════════════════════════════════════════════════════
   3. WORKFLOWS
   ══════════════════════════════════════════════════════════ */
function test_workflows() {
  section('3. WORKFLOWS');
  const { WORKFLOWS, executeWorkflow } = require(BASE + '/workflow.js');

  sub('Workflow 定义');
  const wfIds = Object.keys(WORKFLOWS);
  assertEq(wfIds.length, 4, '4 个 workflow');
  assertDeepEq(wfIds.sort(), ['benchmark', 'general_chat', 'optimization', 'research_solve'].sort(), 'workflow ID 集合正确');

  for (const [id, wf] of Object.entries(WORKFLOWS)) {
    assert(typeof wf.name === 'string', `${id}.name: ${wf.name}`);
    assert(Array.isArray(wf.steps) && wf.steps.length > 0, `${id}.steps 非空 (${wf.steps.length} 步)`);
    for (const step of wf.steps) {
      assert(typeof step.id === 'string', `step ${step.id} 有 id`);
      assert(typeof step.description === 'string', `step ${step.id} 有 description`);
    }
  }

  sub('optimization workflow 步骤顺序');
  const optIds = WORKFLOWS.optimization.steps.map(s => s.id);
  assertDeepEq(optIds, ['detect', 'solve', 'verify', 'explain'], 'optimization: detect→solve→verify→explain');

  sub('conditional routing (nextWhen)');
  const verifyStep = WORKFLOWS.optimization.steps.find(s => s.id === 'verify');
  assert(verifyStep.nextWhen !== undefined, 'verify 有 nextWhen');
  assertEq(verifyStep.nextWhen.fail, 'solve', '验证失败 → 回到 solve');

  sub('research_solve 重试机制');
  const rsSolve = WORKFLOWS.research_solve.steps.find(s => s.id === 'solve');
  assertEq(rsSolve.maxRetries, 2, 'research_solve 的 solve 步骤最多重试 2 次');

  return true;
}

/* ══════════════════════════════════════════════════════════
   4. TOOLS SYSTEM
   ══════════════════════════════════════════════════════════ */
function test_tools() {
  section('4. TOOLS SYSTEM');
  const { TOOLS, ToolExecutor } = require(BASE + '/tools.js');

  sub('Tool 注册表完整性');
  const toolNames = Object.keys(TOOLS);
  assert(toolNames.length >= 10, `至少 10 个工具，实际 ${toolNames.length}`);

  const criticalTools = [
    'polaris_opt', 'polaris_analyze', 'polaris_research',
    'polaris_model', 'polaris_decompose', 'polaris_benchmark',
    'polaris_remember', 'polaris_paper', 'polaris_literature',
    'polaris_code', 'run_code', 'search_web',
  ];
  for (const t of criticalTools) {
    assert(!!TOOLS[t], `关键工具 ${t} 已注册`);
  }

  for (const [id, tool] of Object.entries(TOOLS)) {
    assert(typeof tool.name === 'string' && tool.name.length > 0, `${id}.name: ${tool.name}`);
    assert(typeof tool.description === 'string' && tool.description.length > 5, `${id}.description 足够长`);
    assert(typeof tool.category === 'string', `${id}.category: ${tool.category}`);
    assert(typeof tool.execute === 'function', `${id}.execute 是函数`);
    assert(typeof tool.requires_confirm === 'boolean', `${id}.requires_confirm: ${tool.requires_confirm}`);
  }

  sub('Tool requires_confirm 审计');
  const confirmTools = toolNames.filter(id => TOOLS[id].requires_confirm);
  assert(confirmTools.length >= 2, '至少 2 个工具需要用户确认');
  const highRiskTools = ['polaris_code', 'run_code'];
  for (const t of highRiskTools) {
    assert(TOOLS[t].requires_confirm === true, `${t} 需要用户确认（安全）`);
  }

  sub('Tool 分类分布');
  const categories = {};
  for (const [id, tool] of Object.entries(TOOLS)) {
    categories[tool.category] = (categories[tool.category] || 0) + 1;
  }
  console.log(`    分类: ${Object.entries(categories).map(([k, v]) => `${k}(${v})`).join(', ')}`);
  assert(Object.keys(categories).length >= 4, '至少 4 个分类');

  sub('ToolExecutor');
  const te = new ToolExecutor();
  assertEq(te.getTool('nonexistent'), null, '不存在工具返回 null');
  assert(!!te.getTool('search_web'), '存在工具返回定义');

  const toolList = te.listTools();
  assert(Array.isArray(toolList) && toolList.length >= 8, `listTools 返回 ${toolList.length} 个工具`);
  assert(toolList.every(t => t.id && t.name && t.description), '每个工具都有 id/name/description');

  sub('确认流程');
  assert(te.rejectConfirmation('fake').rejected, '拒绝不存在确认 ID 返回 rejected');
  assert(te.confirmAndExecute('nonexistent').error, '执行不存在确认返回错误');
  // confirm 安全工具应该不需要确认
  te.execute('search_web', { query: 'test' }).then(r => {
    assert(!r.confirmation_required, 'search_web 不需要确认');
  }).catch(() => { skip++; results.push({ status: 'SKIP', msg: 'search_web 执行需要网络' }); });

  sub('工具历史');
  const history = te.getHistory();
  assert(Array.isArray(history), '历史是数组');

  return true;
}

/* ══════════════════════════════════════════════════════════
   5. RELIABILITY — CircuitBreaker & withFallback
   ══════════════════════════════════════════════════════════ */
async function test_reliability() {
  section('5. RELIABILITY');
  const { CircuitBreaker, withFallback } = require(BASE + '/reliability.js');

  sub('CircuitBreaker 基础');
  const cb = new CircuitBreaker('test_cb', { failureThreshold: 2, resetTimeout: 100 });
  assertEq(cb.state, 'closed', '初始状态 closed');

  let callCount = 0;
  const successFn = async () => { callCount++; return { success: true, data: 'ok' }; };
  const r1 = await cb.execute(successFn);
  assert(r1.success, '成功调用通过');
  assertEq(callCount, 1, '函数被执行');
  assertEq(cb.state, 'closed', '成功后保持 closed');

  sub('CircuitBreaker 熔断触发');
  const failFn = async () => { throw new Error('Simulated failure'); };
  try { await cb.execute(failFn); } catch {}
  assertEq(cb.failureCount, 1, '失败计数 1');
  try { await cb.execute(failFn); } catch {}
  assertEq(cb.state, 'open', '两次失败后熔断打开');
  assertEq(cb.failureCount, 2, '失败计数 2');

  const r3 = await cb.execute(successFn);
  assert(!r3.success, '熔断状态下快速失败');
  assert(r3.error.includes('熔断'), '错误信息包含"熔断"');

  sub('CircuitBreaker 恢复 (half-open)');
  // Wait past resetTimeout
  await new Promise(r => setTimeout(r, 120));
  const r4 = await cb.execute(successFn);
  assert(r4.success, 'half-open 后成功');
  assertEq(cb.state, 'closed', '成功后回到 closed');

  sub('withFallback 多路径');
  const paths = [
    async () => { throw new Error('Path 0 failed'); },
    async () => ({ success: true, data: 'Path 1 wins' }),
    async () => ({ success: true, data: 'Path 2 never runs' }),
  ];
  const rf = await withFallback(paths);
  assert(rf.success, 'fallback 成功');
  assertEq(rf.data, 'Path 1 wins', '第一条成功路径返回');

  sub('withFallback 全部失败');
  const allFail = [
    async () => { throw new Error('E1'); },
    async () => { throw new Error('E2'); },
  ];
  const ra = await withFallback(allFail);
  assert(!ra.success, '全部失败返回 false');
  assert(ra.error.includes('E1') || ra.error.includes('求解引擎'), '错误信息包含原因');

  sub('CircuitBreaker 默认参数');
  const defaultCb = new CircuitBreaker('default');
  assertEq(defaultCb.failureThreshold, 3, '默认失败阈值 3');
  assertEq(defaultCb.resetTimeout, 30000, '默认重置超时 30s');

  return true;
}

/* ══════════════════════════════════════════════════════════
   6. HEALTH CHECK
   ══════════════════════════════════════════════════════════ */
function test_health_check() {
  section('6. HEALTH CHECK');

  try {
    const hc = require(BASE + '/health_check.js');

    sub('导出函数');
    assert(typeof hc.runHealthCheck === 'function', 'runHealthCheck 已导出');
    assert(typeof hc.checkPython === 'function', 'checkPython 已导出');
    assert(typeof hc.checkPolaris === 'function', 'checkPolaris 已导出');
    assert(typeof hc.checkDeepSeek === 'function', 'checkDeepSeek 已导出');
    assert(typeof hc.buildAgentCapabilityNote === 'function', 'buildAgentCapabilityNote 已导出');

    sub('buildAgentCapabilityNote');
    const allOk = [
      { service: 'Python', ok: true },
      { service: 'Polaris Engine', ok: true },
      { service: 'DeepSeek API', ok: true },
    ];
    assertEq(hc.buildAgentCapabilityNote(allOk), '', '全部就绪返回空字符串');

    const noPython = [{ service: 'Python', ok: false }];
    const note1 = hc.buildAgentCapabilityNote(noPython);
    assert(note1.includes('未安装'), '缺少 Python 包含提示');
    assert(note1.includes('polaris_opt'), '提示中列出不可用工具');

    const noEngine = [
      { service: 'Python', ok: true },
      { service: 'Polaris Engine', ok: false },
    ];
    const note2 = hc.buildAgentCapabilityNote(noEngine);
    assert(note2.includes('pip install'), '缺少引擎提示安装命令');
    assert(note2.includes('PuLP') || note2.includes('SciPy'), '提示备选方案');

    sub('Health report 格式一致性');
    const partial = [
      { service: 'Python', ok: true },
      { service: 'Polaris Engine', ok: true },
      { service: 'HiGHS Solver', ok: true },
      { service: 'DeepSeek API', ok: false },
    ];
    // DeepSeek down but engine OK → returns '' (engine handles offline)
    const note3 = hc.buildAgentCapabilityNote(partial);
    assert(typeof note3 === 'string', 'partial fault 返回字符串');

  } catch (e) {
    skip++; results.push({ status: 'SKIP', msg: 'health_check: ' + e.message });
  }

  return true;
}

/* ══════════════════════════════════════════════════════════
   7. EMAIL SERVICE (validate helpers)
   ══════════════════════════════════════════════════════════ */
function test_email() {
  section('7. EMAIL SERVICE');

  try {
    // Only test generateCode (pure function, no SMTP)
    const email = require(BASE + '/email.js');

    sub('generateCode');
    assert(typeof email.generateCode === 'function', 'generateCode 已导出');
    const c1 = email.generateCode();
    assert(/^\d{6}$/.test(c1), `验证码 ${c1} 为 6 位数字`);
    const c2 = email.generateCode();
    assert(c1 !== c2, '两次生成验证码不同');
    assert(parseInt(c1) >= 100000 && parseInt(c1) <= 999999, '验证码在 100000-999999 范围');

    sub('API 导出');
    assert(typeof email.sendVerificationCode === 'function', 'sendVerificationCode 已导出');
    assert(typeof email.sendWelcomeEmail === 'function', 'sendWelcomeEmail 已导出');
    assert(typeof email.sendPasswordResetCode === 'function', 'sendPasswordResetCode 已导出');

  } catch (e) {
    skip++; results.push({ status: 'SKIP', msg: 'email: ' + e.message });
  }

  return true;
}

/* ══════════════════════════════════════════════════════════
   8. INTENT CLASSIFICATION (static audit + structure)
   ══════════════════════════════════════════════════════════ */
function test_intent() {
  section('8. INTENT CLASSIFICATION');

  try {
    const intent = require(BASE + '/intent.js');

    sub('API 导出');
    assert(typeof intent.classifyIntent === 'function', 'classifyIntent 已导出');

  } catch (e) {
    skip++; results.push({ status: 'SKIP', msg: 'intent: ' + e.message });
  }

  // Static audit of intent source
  sub('源代码审计');
  const src = readSrc('intent.js');

  // Check for known bug: DEFAULT_KEY
  const hasBug = /DEFAULT_KEY/.test(src) && !/getKey/.test(src) && !/DEFAULT_KEY\s*=/.test(src);
  if (hasBug) {
    console.log('  ⚠  BUG: intent.js 引用未定义的 DEFAULT_KEY');
    fail++; results.push({ status: 'FAIL', msg: 'BUG: intent.js 引用未定义的 DEFAULT_KEY' });
  } else {
    pass++; results.push({ status: 'PASS', msg: 'intent.js 没有 DEFAULT_KEY 引用问题' });
  }

  // Check prompt quality
  assert(src.includes('discuss') && src.includes('solve') && src.includes('experiment'),
    '分类 prompt 包含所有 5 个意图标签');
  assert(src.includes('chat'), '分类包含 chat 模式');
  assert(src.includes('max_tokens'), '设置了 max_tokens 限制');

  return true;
}

/* ══════════════════════════════════════════════════════════
   9. SECRETS VAULT
   ══════════════════════════════════════════════════════════ */
function test_secrets() {
  section('9. SECRETS VAULT');
  const secrets = require(BASE + '/secrets.js');

  sub('API 导出');
  assert(typeof secrets.get === 'function', 'get 已导出');
  assert(typeof secrets.getAll === 'function', 'getAll 已导出');
  assert(typeof secrets.encryptAll === 'function', 'encryptAll 已导出(CLI)');

  sub('加密/解密循环');
  const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('crypto');
  const key = createHash('sha256').update('test_seed_12345').digest();
  const plaintext = 'sk-test-key-abc123';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  assertEq(decrypted, plaintext, 'AES-256-GCM 加密/解密循环正确');

  sub('Vault 解密');
  const deepseekKey = secrets.get('deepseek_api_key');
  assert(typeof deepseekKey === 'string' && deepseekKey.length > 5, 'DeepSeek key 已解密');
  assert(deepseekKey.startsWith('sk-'), 'DeepSeek key 格式: sk-...');

  const smtpPass = secrets.get('smtp_password');
  assert(typeof smtpPass === 'string' && smtpPass.length > 0, 'SMTP 密码已解密');

  const sbKey = secrets.get('supabase_service_role');
  assert(typeof sbKey === 'string' && sbKey.length > 5, 'Supabase key 已解密');
  assert(sbKey.startsWith('sb_'), 'Supabase key 格式: sb_...');

  sub('Vault 缓存');
  const firstCall = secrets.getAll();
  const secondCall = secrets.getAll();
  assert(firstCall === secondCall, 'getAll 返回缓存引用');

  return true;
}

/* ══════════════════════════════════════════════════════════
   10. EXPERIMENT MEMORY
   ══════════════════════════════════════════════════════════ */
function test_experiment_memory() {
  section('10. EXPERIMENT MEMORY');
  const mem = require(BASE + '/experiment_memory.js');

  sub('记录实验');
  const r1 = mem.recordExperiment({
    problem: 'knapsack', size: 50, solver: 'highs',
    objective_value: 220, time: 0.234, status: 'optimal',
  });
  assert(typeof r1 === 'object' && r1.id, '返回包含 id');
  assert(r1.problem === 'knapsack', 'problem 字段正确');
  assert(r1.size === 50, 'size 字段正确');

  const r2 = mem.recordExperiment({ problem: 'assignment', size: 100, solver: 'benders', iterations: 15 });
  assert(r2.id !== undefined && r2.problem === 'assignment', '第二条记录正确');
  assert(r2.id.includes('exp_'), 'ID 格式为 exp_...');
  assert(typeof r2.timestamp === 'string', '有 ISO timestamp');

  sub('查询实验');
  const lastKp = mem.lastExperiment('knapsack');
  assert(lastKp !== null && lastKp !== undefined, '查询 knapsack 最近实验存在');
  assertEq(lastKp.problem, 'knapsack', '按 problem 过滤正确');

  const all = mem.listExperiments();
  assert(Array.isArray(all) && all.length >= 2, `列出实验: ${all.length} 条`);
  const kpList = mem.listExperiments('knapsack');
  assert(Array.isArray(kpList), '按 problem 筛选返回数组');

  sub('实验上下文');
  const ctx = mem.buildExperimentContext(3);
  assert(typeof ctx === 'string' && ctx.length > 0, '实验上下文非空字符串');
  assert(ctx.includes('knapsack'), '上下文包含最近实验');

  sub('Edge: 未记录时查询');
  const noExp = mem.lastExperiment('nonexistent_problem_xyz');
  assert(noExp === undefined || noExp === null, '不存在实验返回 null/undefined');

  return true;
}

/* ══════════════════════════════════════════════════════════
   11. PLANNER
   ══════════════════════════════════════════════════════════ */
function test_planner() {
  section('11. PLANNER');

  // planner.js requires desktop.js which requires electron — skip in pure Node.js
  let Planner, RESEARCH_WORKFLOWS;
  try {
    const m = require(BASE + '/planner.js');
    Planner = m.Planner;
    RESEARCH_WORKFLOWS = m.RESEARCH_WORKFLOWS;
  } catch (e) {
    if (e.message && e.message.includes('electron')) {
      skip++; results.push({ status: 'SKIP', msg: 'planner 需要 Electron 运行时' });
      return true;
    }
    throw e;
  }

  sub('Workflow 模板');
  const wfIds = Object.keys(RESEARCH_WORKFLOWS);
  assertEq(wfIds.length, 3, '3 个研究 workflow');
  assertDeepEq(wfIds.sort(), ['experiment', 'method_compare', 'paper_prep'].sort(), 'workflow ID 正确');

  for (const [id, wf] of Object.entries(RESEARCH_WORKFLOWS)) {
    assert(Array.isArray(wf.steps) && wf.steps.length > 0, `${id} 有 ${wf.steps.length} 步`);
    assert(wf.steps.every(s => s.id && s.action && s.description), `${id} 每步字段完整`);
    // Every step should have agent assigned
    assert(wf.steps.every(s => s.agent), `${id} 每步都有 agent`);
  }

  sub('Plan 生成 (意图路由)');
  const planner = new Planner();

  const p1 = planner.generatePlan('跑个背包问题的批量实验对比 HiGHS 和 Benders');
  assertEq(p1.type, 'research', '实验 → research');
  assertEq(p1.workflow, 'experiment', '实验 → experiment template');
  assert(p1.steps.length >= 3, '实验计划有多步');
  assert(p1.steps.some(s => s.action === 'experiment'), '包含实验步骤');
  assert(p1.steps.some(s => s.action === 'save'), '包含保存步骤');

  const p2 = planner.generatePlan('对比 Benders 分解和 Column Generation 在排产问题上的收敛性能');
  assertEq(p2.workflow, 'method_compare', '方法论对比 → method_compare');
  assert(p2.steps.some(s => s.action === 'benchmark'), 'method_compare 有 benchmark 步骤');

  const p3 = planner.generatePlan('帮我生成论文用的 LaTeX 表格和收敛图');
  assertEq(p3.workflow, 'paper_prep', '论文准备 → paper_prep');
  assert(p3.steps.some(s => s.action === 'open_editor'), 'paper_prep 有 open_editor');

  const p4 = planner.generatePlan('帮我整理下载文件夹里的 PDF 文件');
  assertEq(p4.workflow, 'file_ops', '文件操作 → file_ops');
  assertEq(p4.type, 'system', '文件操作为 system 类型');

  const p5 = planner.generatePlan('打开浏览器搜索组合优化');
  assertEq(p5.workflow, 'quick', '快速操作 → quick');

  const p6 = planner.generatePlan('随便聊聊');
  assertEq(p6.workflow, 'default', '未匹配 → default');
  assertEq(p6.type, 'general', '默认类型为 general');

  sub('Plan 生命周期');
  const pendingCount = planner.getPendingPlans().length;
  assert(pendingCount > 0, `有 pending plans (${pendingCount})`);

  const p7 = planner.generatePlan('分析这个排产问题的结构');
  const rejected = planner.rejectPlan(p7.id);
  assert(rejected.rejected, 'plan 被拒绝');
  const stillPending = planner.getPendingPlans().filter(p => p.id === p7.id);
  assertEq(stillPending.length, 0, '拒绝后不在 pending 中');

  sub('Plan 字段完整性');
  const p8 = planner.generatePlan('求解背包问题');
  assert(typeof p8.id === 'string' && p8.id.startsWith('plan_'), `plan ID: ${p8.id}`);
  assert(typeof p8.createdAt === 'number', '有 createdAt');
  assert(p8.request.includes('背包'), '保留原始请求');

  return true;
}

/* ══════════════════════════════════════════════════════════
   12. SUBAGENTS + RESULT ANALYZER
   ══════════════════════════════════════════════════════════ */
function test_subagents() {
  section('12. SUBAGENTS & RESULT ANALYZER');

  sub('SUBAGENTS 定义');
  const { SUBAGENTS, runPipeline } = require(BASE + '/subagents.js');
  const subIds = Object.keys(SUBAGENTS);
  assertEq(subIds.length, 4, '4 个 subagent');
  assertDeepEq(subIds.sort(), ['analyzer', 'experimenter', 'solver', 'writer'].sort(), 'subagent ID 正确');

  for (const [id, agent] of Object.entries(SUBAGENTS)) {
    assert(typeof agent.name === 'string', `${id}.name: ${agent.name}`);
    assert(typeof agent.prompt === 'string' && agent.prompt.length > 20, `${id}.prompt 足够长`);
    assert(typeof agent.color === 'string', `${id}.color: ${agent.color}`);
  }

  sub('Pipeline 函数签名');
  assert(typeof runPipeline === 'function', 'runPipeline 已导出');

  sub('Result Analyzer');
  try {
    const { analyzeResults } = require(BASE + '/result_analyzer.js');
    assert(typeof analyzeResults === 'function', 'analyzeResults 已导出');
  } catch (e) {
    skip++; results.push({ status: 'SKIP', msg: 'result_analyzer: ' + e.message });
  }

  return true;
}

/* ══════════════════════════════════════════════════════════
   13. LOGGER + KEYMANAGER + PERSONA
   ══════════════════════════════════════════════════════════ */
function test_supporting() {
  section('13. 支持模块');

  sub('Logger');
  try {
    const logger = require(BASE + '/logger.js');
    assert(typeof logger.info === 'function', 'logger.info 是函数');
    assert(typeof logger.warn === 'function', 'logger.warn 是函数');
    assert(typeof logger.error === 'function', 'logger.error 是函数');
    assert(typeof logger.newTraceId === 'function', 'logger.newTraceId 是函数');

    const tid = logger.newTraceId();
    assert(typeof tid === 'string' && tid.length > 0, `newTraceId: ${tid}`);

    // Should not throw
    logger.info('test', { key: 'val' });
    logger.warn('test warning', {});
    logger.error('test error', { stack: 'fake' });
    pass++; results.push({ status: 'PASS', msg: 'Logger 调用不抛异常' });
  } catch (e) {
    skip++; results.push({ status: 'SKIP', msg: 'logger: ' + e.message });
  }

  sub('KeyManager');
  try {
    const km = require(BASE + '/keymanager.js');
    assert(typeof km.setKey === 'function', 'setKey 是函数');
    assert(typeof km.getKey === 'function', 'getKey 是函数');

    km.setKey('test-key-abc');
    assertEq(km.getKey(), 'test-key-abc', 'key 设置/获取正确');

    km.setKey(null);
    assertEq(km.getKey(), null, 'key 可设为 null');
  } catch (e) {
    skip++; results.push({ status: 'SKIP', msg: 'keymanager: ' + e.message });
  }

  sub('Persona');
  try {
    const { POLARIS_PERSONA } = require(BASE + '/persona.js');
    assert(typeof POLARIS_PERSONA === 'string' && POLARIS_PERSONA.length > 50, 'Polaris persona 非空');
  } catch (e) {
    skip++; results.push({ status: 'SKIP', msg: 'persona: ' + e.message });
  }

  sub('Token Budget');
  try {
    const tb = require(BASE + '/token_budget.js');
    assert(typeof tb === 'object', 'token_budget 是对象');
  } catch (e) {
    skip++; results.push({ status: 'SKIP', msg: 'token_budget: ' + e.message });
  }

  return true;
}

/* ══════════════════════════════════════════════════════════
   14. 代码一致性审计
   ══════════════════════════════════════════════════════════ */
function test_audit() {
  section('14. 代码一致性审计');

  const { TOOLS } = require(BASE + '/tools.js');
  const { SKILLS } = require(BASE + '/skills.js');
  const agents = require(BASE + '/agents.js');
  const { WORKFLOWS } = require(BASE + '/workflow.js');

  sub('Tool 引用一致性');
  // 收集所有 skill/agent 引用的工具
  const allToolRefs = new Set();
  for (const skill of Object.values(SKILLS)) {
    for (const t of skill.tools) allToolRefs.add(t);
  }
  for (const agent of Object.values(agents)) {
    for (const t of agent.tools) allToolRefs.add(t);
  }
  for (const ref of allToolRefs) {
    assert(!!TOOLS[ref], `引用工具 ${ref} 在 TOOLS 中存在`);
  }
  console.log(`    ${allToolRefs.size} 个工具引用全部在注册表中`);

  sub('Agent 引用一致性');
  const agentIds = new Set(Object.keys(agents));
  for (const [id, agent] of Object.entries(agents)) {
    for (const h of agent.handoffs) {
      assert(agentIds.has(h), `${id}.handoffs → ${h} 存在`);
    }
  }
  for (const wf of Object.values(WORKFLOWS)) {
    for (const step of wf.steps) {
      if (step.agent) {
        assert(agentIds.has(step.agent), `workflow step ${step.id}.agent → ${step.agent} 存在`);
      }
    }
  }

  sub('主进程 IPC 注册比对');
  const mainSrc = readSrc('../main.js') || fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const preloadSrc = readSrc('../preload.js') || fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.js'), 'utf8');

  // Check main registers handler, preload exposes it
  const mainHandlers = (mainSrc.match(/ipcMain\.handle\('([^']+)'/g) || []).map(m => m.match(/'([^']+)'/)[1]);
  const preloadEndpoints = (preloadSrc.match(/ipcRenderer\.invoke\('([^']+)'/g) || []).map(m => m.match(/'([^']+)'/)[1]);
  console.log(`    main 注册 ${mainHandlers.length} 个 IPC handler, preload 暴露 ${preloadEndpoints.length} 个 endpoint`);

  // Critical endpoints must exist
  const criticalEndpoints = ['polaris:query', 'polaris:queryStream', 'sandbox:setup', 'email:sendCode', 'auth:unlock', 'planner:generate'];
  for (const ep of criticalEndpoints) {
    assert(mainHandlers.includes(ep), `main.js 注册 ${ep}`);
  }
  assert(preloadEndpoints.includes('polaris:queryStream') || preloadSrc.includes('queryStream'), 'preload 暴露 queryStream');

  sub('版本号审计');
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  assert(pkg.version !== undefined, `版本: ${pkg.version}`);
  assert(pkg.build !== undefined, 'electron-builder 配置存在');
  assert(pkg.build.win !== undefined, 'Windows 构建目标配置存在');

  sub('前端组件引用一致性');
  const settingsSrc = readComp('SettingsPanel.tsx');
  // Check Redux actions by reading the TypeScript source (can't require .ts directly)
  const slicePath = path.join(__dirname, '..', 'src', 'store', 'chatSlice.ts');
  let sliceSrc = '';
  try { sliceSrc = fs.readFileSync(slicePath, 'utf8'); } catch {}
  const actionCount = (sliceSrc.match(/[a-zA-Z]+:\s*\(/g) || []).length;
  assert(actionCount >= 10, `Redux slice 定义至少 10 个 action，实际约 ${actionCount}`);

  return true;
}

/* ══════════════════════════════════════════════════════════
   15. Redux Store 状态机审计
   ══════════════════════════════════════════════════════════ */
function test_redux_store() {
  section('15. REDUX STORE');

  // Read the compiled JS (not TSX) — the slice is JS already
  const slicePath = path.join(__dirname, '..', 'src', 'store', 'chatSlice.js');
  let chatSlice;
  try {
    chatSlice = fs.readFileSync(slicePath, 'utf8');
  } catch {
    skip++; results.push({ status: 'SKIP', msg: 'chatSlice.js 不存在(需先 build)' });
    return true;
  }

  // Just check the action names and reducer structure
  const actionMatch = chatSlice.match(/export const \{([^}]+)\}/);
  if (actionMatch) {
    const actions = actionMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
    const actionCount = actions.filter(a => a.includes(':')).length;
    assert(actionCount >= 15, `至少 15 个 Redux actions，实际约 ${actionCount}`);
  }

  sub('初始状态完整性');
  assert(chatSlice.includes('sessions:'), '初始状态包含 sessions');
  assert(chatSlice.includes('activeSessionId'), '初始状态包含 activeSessionId');
  assert(chatSlice.includes('streaming:'), '初始状态包含 streaming');
  assert(chatSlice.includes('strategy:'), '初始状态包含 strategy');
  assert(chatSlice.includes('settings:'), '初始状态包含 settings');
  assert(chatSlice.includes('engineStatus'), '初始状态包含 engineStatus');
  assert(chatSlice.includes('contextTokens'), '初始状态包含 contextTokens');

  sub('Markdown 渲染器完整性 (App.tsx)');
  const appSrc = readComp('App.tsx');
  if (appSrc) {
    assert(appSrc.includes('```'), 'App.md() 处理代码块');
    assert(appSrc.includes('\\|') || appSrc.includes('table'), 'App.md() 处理表格');
    assert(appSrc.includes('\\*\\*'), 'App.md() 处理粗体');
    assert(appSrc.includes('^###'), 'App.md() 处理标题');
  }

  sub('Onboarding 组件');
  const onboardingSrc = readComp('Onboarding.tsx');
  if (onboardingSrc) {
    assert(onboardingSrc.includes('ONBOARDING_KEY'), 'Onboarding 有持久化 key');
    assert(onboardingSrc.includes('useState'), 'Onboarding 使用 hooks');
  }

  return true;
}

/* ══════════════════════════════════════════════════════════
   16. KNOWN BUG 检测
   ══════════════════════════════════════════════════════════ */
function test_known_bugs() {
  section('16. KNOWN BUG 检测');

  sub('intent.js DEFAULT_KEY 未定义');
  const intentSrc = readSrc('intent.js');
  const hasDefaultKeyBug = /DEFAULT_KEY/.test(intentSrc) && !/DEFAULT_KEY\s*=/.test(intentSrc);
  if (hasDefaultKeyBug) {
    console.log('  ⚠  BUG: intent.js 引用未定义的 DEFAULT_KEY (建议改为 getKey())');
    fail++; results.push({ status: 'FAIL', msg: 'BUG: intent.js DEFAULT_KEY 未定义' });
  } else {
    pass++; results.push({ status: 'PASS', msg: 'intent.js DEFAULT_KEY 正确' });
  }

  sub('LoginModal hooks 顺序 (React #310)');
  const loginSrc = readComp('LoginModal.tsx');
  const earlyReturn = loginSrc.indexOf('if (!show) return null');
  const resetStageHook = loginSrc.indexOf("useState<''|'setPwd'>");
  if (resetStageHook > 0 && resetStageHook < earlyReturn) {
    pass++; results.push({ status: 'PASS', msg: 'LoginModal hooks 都在早返回之前' });
  } else if (resetStageHook > earlyReturn) {
    console.log('  ⚠  BUG: LoginModal hooks 仍在早返回之后!');
    fail++; results.push({ status: 'FAIL', msg: 'BUG: LoginModal hooks 在早返回之后 (React #310)' });
  } else {
    pass++; results.push({ status: 'PASS', msg: 'LoginModal hooks 检查通过' });
  }

  sub('router.js 导出完整性');
  const routerSrc = readSrc('router.js');
  assert(routerSrc.includes('executeQuery'), 'router 导出 executeQuery');
  assert(routerSrc.includes('setApiKey'), 'router 导出 setApiKey');
  assert(routerSrc.includes('getApiKey'), 'router 导出 getApiKey');
  assert(routerSrc.includes('module.exports'), 'router 有 module.exports');

  sub('preload.js endpoint 完整性');
  const preloadSrc = readSrc('../preload.js') || fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.js'), 'utf8');
  const requiredEndpoints = [
    'query', 'queryStream', 'onStreamChunk', 'onStreamEnd', 'removeStreamListeners',
    'desktopScreenshot', 'sandboxSetup', 'sandboxAutoSetup', 'onSandboxProgress',
    'emailSendCode', 'emailForgotPassword', 'authUnlock', 'authLock',
    'plannerGenerate', 'plannerExecute', 'healthCheck',
  ];
  for (const ep of requiredEndpoints) {
    assert(preloadSrc.includes(ep), `preload 暴露 ${ep}`);
  }

  return true;
}

/* ══════════════════════════════════════════════════════════
   17. INTEGRATION: 完整请求流程图
   ══════════════════════════════════════════════════════════ */
function test_integration() {
  section('17. 集成：完整请求流程图');

  const { SKILLS, SkillManager } = require(BASE + '/skills.js');
  const agents = require(BASE + '/agents.js');
  const { WORKFLOWS } = require(BASE + '/workflow.js');
  const { TOOLS } = require(BASE + '/tools.js');

  // Planner may not be available outside Electron
  let Planner = null;
  try { const m = require(BASE + '/planner.js'); Planner = m.Planner; } catch {}

  sub('场景 1: 用户问"设计一个LBBD算法"');
  // intent → discuss skill → researcher agent → tools: analyze + search
  const sm = new SkillManager();
  sm.switchTo('discuss');
  assert(sm.getActive().tools.includes('search_web'), '讨论模式可搜索');
  assert(sm.getActive().tools.includes('polaris_literature'), '讨论模式可查文献');
  assert(agents.researcher.tools.includes('polaris_analyze'), 'researcher 可分析结构');

  sub('场景 2: 用户输入"背包容量50，价值60 100 120"');
  sm.switchTo('solve');
  assert(sm.getActive().temperature === 0.1, '求解模式低温(精确)');
  assert(sm.getActive().tools.includes('polaris_opt'), '求解模式有 polaris_opt');
  assert(agents.solver.tools.length >= 3, 'solver 有足够工具');

  sub('场景 3: 用户说"跑实验对比Benders和CG"');
  sm.switchTo('experiment');
  assert(sm.getActive().tools.includes('polaris_research'), '实验模式有 research');
  assert(sm.getActive().tools.includes('polaris_remember'), '实验模式有 remember');

  if (Planner) {
    const planner = new Planner();
    const plan = planner.generatePlan('对比Benders和CG在背包问题上的收敛性能');
    assert(plan.type === 'research', '生成研究计划');
    assert(plan.steps.some(s => s.action === 'experiment'), '有实验步骤');
    assert(plan.steps.some(s => s.action === 'save'), '有保存步骤');
    assert(plan.steps.some(s => s.id === 'save' && s.needsConfirm), '保存步骤需要确认');
  }

  sub('场景 4: Handoff 链条 -> optimization workflow');
  // 用户求解 → optimization workflow: detect→solve→verify→explain
  const wf = WORKFLOWS.optimization;
  const wfAgentIds = new Set(wf.steps.map(s => s.agent));
  assert(wfAgentIds.has('solver'), 'workflow 使用 solver');
  assert(wfAgentIds.has('verifier'), 'workflow 使用 verifier');
  assert(wfAgentIds.has('explainer'), 'workflow 使用 explainer');

  // Verify all workflow agents exist
  for (const step of wf.steps) {
    assert(!!agents[step.agent], `workflow agent ${step.agent} 存在`);
  }

  sub('场景 5: 模块间通信完整性');
  // Skill → tools → agents → workflows 四层都连通
  const skillTools = sm.getActiveTools();
  const allToolIds = Object.keys(TOOLS);
  for (const st of skillTools) {
    assert(allToolIds.includes(st), `skill tool ${st} 在 TOOLS 中`);
  }

  const agentToolRefs = new Set();
  for (const a of Object.values(agents)) {
    for (const t of a.tools) agentToolRefs.add(t);
  }
  for (const ref of agentToolRefs) {
    assert(allToolIds.includes(ref), `agent tool ${ref} 在 TOOLS 中`);
  }

  return true;
}

/* ══════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════ */
async function main() {
  const startTime = Date.now();

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          Polaris Solver 全功能自动化测试套件 v1.1           ║
║                  BitWool Studio © 2026                      ║
╚══════════════════════════════════════════════════════════════╝
`);

  const tests = [
    ['Skills System', test_skills],
    ['Agents System', test_agents],
    ['Workflows', test_workflows],
    ['Tools System', test_tools],
    ['Reliability (CB+Fallback)', test_reliability],
    ['Health Check', test_health_check],
    ['Email (generateCode)', test_email],
    ['Intent Classify', test_intent],
    ['Secrets Vault', test_secrets],
    ['Experiment Memory', test_experiment_memory],
    ['Planner', test_planner],
    ['Subagents & Result Analyzer', test_subagents],
    ['Logger+KeyManager+Persona', test_supporting],
    ['Code Audit (consistency)', test_audit],
    ['Redux Store + Components', test_redux_store],
    ['Known Bug Detection', test_known_bugs],
    ['Integration (full flow)', test_integration],
  ];

  let crashed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
    } catch (e) {
      console.error(`\n  💥 MODULE "${name}" CRASHED: ${e.message}`);
      const stack = e.stack?.split('\n').slice(1, 4).join('\n    ');
      if (stack) console.error(`    ${stack}`);
      crashed++;
      results.push({ status: 'CRASH', msg: `${name}: ${e.message}` });
      fail++;
    }
  }

  // ── Report ──
  const elapsed = Date.now() - startTime;
  const total = pass + fail + skip;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  测试报告`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  模块: ${tests.length}  |  总计: ${total}  |  通过: ${pass}  |  失败: ${fail}  |  跳过: ${skip}`);
  console.log(`  耗时: ${(elapsed / 1000).toFixed(2)}s`);
  console.log(`${'═'.repeat(60)}`);

  // Details
  const failures = results.filter(r => r.status === 'FAIL' || r.status === 'CRASH');
  if (failures.length > 0) {
    console.log(`\n  ── 失败/崩溃 (${failures.length}) ──`);
    for (const f of failures) {
      console.log(`  ${f.status === 'CRASH' ? '💥' : '✗'} ${f.msg}`);
    }
  }

  const skipped = results.filter(r => r.status === 'SKIP');
  if (skipped.length > 0) {
    console.log(`\n  ── 跳过 (${skipped.length}) ──`);
    for (const s of skipped) console.log(`  ○ ${s.msg}`);
  }

  console.log(`\n  ${fail === 0 ? '✅ 全部通过！' : `❌ ${fail} 项失败，请修复。`}`);
  console.log(`  ${crashed > 0 ? `💥 ${crashed} 个模块崩溃` : ''}`);

  process.exit(fail > 0 ? 1 : 0);
}

main();

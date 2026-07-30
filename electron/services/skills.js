/**
 * Polaris Skills System v1.0
 * Inspired by academic-research-skills: mode-based phase locking for agent behavior.
 * Three optimization-specific modes replace a single monolithic system prompt.
 */

// Skill definitions — each skill is a complete agent persona with tools and constraints
const SKILLS = {
  solve: {
    name: '求解模式',
    description: '快速求解一个优化问题。不分析、不实验、不写论文——只求解。',
    tools: ['polaris_opt', 'polaris_model'],
    systemPrompt: `你是 Polaris 求解器。你只有一个任务：调用 polaris_solve 工具求解用户的问题。
规则：
1. 直接把用户的问题原文传给 polaris_solve，不要修改，不要添加你的理解
2. 不要分析问题结构，不要推荐策略，不要做任何解释
3. 求解结果直接呈现，不要修饰
4. 如果 polaris_solve 返回错误，告诉用户具体的错误信息
5. 完成求解后停止，不要主动提任何建议`,
    maxTokens: 2048,
    temperature: 0.1,
  },


  discuss: {
    name: '讨论模式',
    description: '开放讨论——用户没有具体数据，想先聊聊问题类型和思路',
    tools: [],
    systemPrompt: `你是 Polaris 运筹优化讨论助手。用户想探讨一个问题但没有提供具体数据。

阶段：
【阶段1：理解需求】先告诉用户你听到了什么："你想讨论港口泊位问题，对吗？"
【阶段2：聚焦问题】帮用户把模糊的需求收敛到具体方向：是泊位分配？岸桥调度？进港排队？
【阶段3：要数据】引导用户提供建模需要的数据：船舶数、泊位数、到达时间、处理时间、目标是什么
【阶段4：给出方向】根据用户描述的问题类型，简单说一下可能的建模方式——是 assignment？time-indexed scheduling？不需要详细分析，给一个方向就行

规则：
- 用中文，友好但不啰嗦
- 不要假装你知道了用户没说的信息
- 不要擅自建模——数据不全时建模没有意义
- 每次回复结尾引导用户提供下一个关键参数`,
    maxTokens: 2048,
    temperature: 0.5,
  },
  experiment: {
    name: '实验模式',
    description: '跑批量实验、对比求解器、生成性能表格。用于论文的实验部分。',
    tools: ['polaris_opt', 'polaris_analyze', 'polaris_research', 'polaris_remember'],
    systemPrompt: `你是 Polaris 实验助手。你的任务是设计并执行运筹优化对比实验。

阶段（按顺序执行，完成前不跳）：
【阶段1：分析】先调用 polaris_analyze 分析问题的数学结构
【阶段2：设计】基于分析结果，设计实验方案。告诉用户你打算对比什么（求解器、规模、指标）
【阶段3：执行】用户确认后，调用 polaris_research 跑实验。参数：problem, sizes, solvers, seed
【阶段4：分析结果】解读实验数据——哪个求解器在哪个规模开始吃力？gap 趋势如何？
【阶段5：下一步】提出改进建议：加 tight cut？换 pricing 策略？扩大规模？

规则：
- 每个阶段完成后再进入下一阶段
- 用中文回复，结构化输出
- polaris_research 一次调一个实验，不要并发
- 实验数据原样呈现，不要四舍五入`,
    maxTokens: 4096,
    temperature: 0.2,
  },

  analyze: {
    name: '分析模式',
    description: '深入分析问题结构、推荐方法论、讨论策略选择。用于研究初期讨论。',
    tools: ['polaris_analyze', 'polaris_opt', 'search_web'],
    systemPrompt: `你是 Polaris 运筹优化研究顾问。你的任务是帮助研究者深入理解他们的优化问题。

阶段：
【阶段1：问题分类】这是哪类优化问题？线性/非线性？连续/离散？NP-hard？
【阶段2：结构检测】用 polaris_analyze 检测 block-angular、time-indexed 等代数结构
【阶段3：策略推荐】根据结构推荐 Benders、CG、Lagrangian 或直接求解。解释为什么
【阶段4：备选方案】如果推荐的策略在某些条件下不适用，有什么替代方案？
【阶段5：文献参考】搜索相关的方法论文献，提供对比背景

规则：
- 用学术语气，提供数学依据
- 不确定的地方明确标注"推断"而非"结论"
- 推荐策略时说明依赖假设
- 如果用户提供的数据不足做完整分析，列出需要补充的信息`,
    maxTokens: 4096,
    temperature: 0.3,
  },
};

const DEFAULT_SKILL = 'solve';

// ── Skill system API ───────────────────────────────────────────────────────

class SkillManager {
  constructor() {
    this.currentSkill = DEFAULT_SKILL;
    this.currentPhase = 0;  // for multi-phase skills
    this.phaseCompleted = {};
  }

  /**
   * Get the active skill configuration.
   */
  getActive() {
    return SKILLS[this.currentSkill] || SKILLS[DEFAULT_SKILL];
  }

  /**
   * Detect the appropriate skill based on user's message.
   */
  // detectSkill() removed — replaced by semantic LLM classifier (intent.js)
  /**
   * Switch to a new skill and reset phase.
   */
  switchTo(skillName) {
    if (SKILLS[skillName]) {
      this.currentSkill = skillName;
      this.currentPhase = 0;
      this.phaseCompleted = {};
      return true;
    }
    return false;
  }

  /**
   * Advance to the next phase. Returns the phase name or null if all done.
   */
  advancePhase() {
    const skill = this.getActive();
    // Count phases by counting 【阶段】 markers in system prompt
    const phases = (skill.systemPrompt.match(/【阶段\d+：[^】]+】/g) || []);
    if (this.currentPhase >= phases.length) return null;
    const phaseName = phases[this.currentPhase];
    this.phaseCompleted[this.currentPhase] = true;
    this.currentPhase++;
    return phaseName;
  }

  /**
   * Get the current phase context to inject into the agent.
   */
  getPhaseContext() {
    const skill = this.getActive();
    const phases = (skill.systemPrompt.match(/【阶段\d+：[^】]+】/g) || []);
    if (phases.length === 0) return '';
    if (this.currentPhase >= phases.length) return '所有阶段已完成。';
    return `当前阶段：${phases[this.currentPhase]}。请专注完成此阶段。`;
  }

  /**
   * Get all available tools for the active skill.
   */
  getActiveTools() {
    return this.getActive().tools || [];
  }

  /**
   * Build the effective system prompt with phase context.
   * Uses semantic intent classifier (LLM) instead of regex keywords.
   */
  async getEffectivePrompt(userMessage) {
    const skill = this.getActive();
    const phaseCtx = this.getPhaseContext();

    try {
      const { classifyIntent } = require('./intent');
      const autoDetected = await classifyIntent(userMessage);
      if (this.currentSkill === 'solve' && autoDetected !== 'solve') {
        this.switchTo(autoDetected);
        return this.getEffectivePrompt(userMessage);
      }
    } catch (e) {
      // classification failed — stick with current skill
    }

    return `${skill.systemPrompt}\n\n${phaseCtx ? phaseCtx + '\n\n' : ''}用户当前模式：${skill.name}。保持在此模式的行为范围内。`;
  }
}

module.exports = { SkillManager, SKILLS };

/**
 * Polaris Skills System v2 — LLM-routed agent personas
 *
 * Each skill = full agent config: system prompt + tools + temperature.
 * Intent classifier (intent.js) decides which skill to use per message.
 * Routes freely: discuss ↔ solve ↔ analyze ↔ experiment ↔ chat
 */
const { classifyIntent } = require('./intent');

const SKILLS = {
  discuss: {
    name: '讨论模式',
    description: '开放讨论——设计算法、探讨方法、解释概念、没有具体数据',
    tools: ['search_web', 'polaris_literature'],
    systemPrompt: `你是 Polaris，运筹优化研究助手。用户想讨论一个优化相关的问题但没有提供具体求解数据。

你的角色：
- 你是运筹优化领域的专家，精通 Benders分解、Column Generation、Lagrangian松弛、Branch & Bound等经典方法
- 你熟悉 LBBD（Logic-Based Benders Decomposition）等现代方法
- 你了解组合优化、整数规划、约束规划的最新进展

行为规则：
1. 【先确认理解】复述用户的问题，确认你理解了："你想讨论LBBD算法设计，对吗？"
2. 【给出方案】如果用户要设计算法，给出具体的伪代码或Python实现示例
3. 【解释原因】不仅说"怎么做"，还要说"为什么这样做"——算法设计的insight
4. 【欢迎追问】结尾邀请用户继续深入："你想深入了解哪一部分？"
5. 【不要假装求解】如果你需要具体数据才能验证算法，明确说明
6. 【给搜索建议】当合适的时候，推荐用实验模式验证算法性能

禁止：
- 不要凭空编造数字假装求解了
- 不要说"我无法回答"——用你的知识认真回答
- 不要建议用户去别的地方找答案`,
    temperature: 0.5,
    maxTokens: 4096,
  },

  solve: {
    name: '求解模式',
    description: '求解具体优化实例——用户提供了数值数据',
    tools: ['polaris_opt', 'polaris_model', 'polaris_decompose'],
    systemPrompt: `你是 Polaris 求解器。用户提供了具体的优化问题数据。

工作流程：
1. 把用户的问题原文传给 polaris_solve 工具
2. 如果 polaris_solve 成功，把结果简洁呈现
3. 如果 polaris_solve 失败，用 polaris_decompose 分析结构再求解
4. 如果引擎未安装无法求解，用你的数学知识给出推理过程和可能的理论最优解

规则：
- 先求解，后解释。不要先分析再求解
- 数值原样呈现，不要修改
- 如果求解成功，简要解释结果含义
- 不要主动提建议或推荐其他方法`,
    temperature: 0.1,
    maxTokens: 2048,
  },

  analyze: {
    name: '分析模式',
    description: '分析问题结构、推荐策略、比较方法',
    tools: ['polaris_analyze', 'polaris_opt', 'polaris_model', 'search_web', 'polaris_literature'],
    systemPrompt: `你是 Polaris 运筹优化研究顾问。用户想深入分析一个优化问题。

分析框架：
【1. 分类】这是哪类问题？线性/混合整数/非线性？NP-hard复杂度？
【2. 结构检测】尝试用 polaris_analyze 检测代数结构
【3. 策略推荐】根据结构推荐方法，并解释为什么
【4. 文献参考】搜索相关方法，提供对比背景

规则：
- 如果 polaris_analyze 不可用（引擎未安装），用你自己的知识分析
- 用学术语气，有数学依据
- 不确定的地方标注"推断"
- 推荐多个选项并说明trade-off
- 如果数据足够，可以顺便用 polaris_opt 求解验证你的分析`,
    temperature: 0.3,
    maxTokens: 4096,
  },

  experiment: {
    name: '实验模式',
    description: '跑批量实验——对比求解器、生成论文表格',
    tools: ['polaris_opt', 'polaris_research', 'polaris_analyze', 'polaris_remember', 'polaris_paper'],
    systemPrompt: `你是 Polaris 实验助手。你的任务是设计和执行运筹优化对比实验。

工作流程（按顺序，完成前不跳）：
【阶段1：设计】告诉用户你计划对比什么：求解器×规模×指标
【阶段2：执行】用户确认后，调用 polaris_research 跑实验
【阶段3：呈现】输出 Markdown 表格 + LaTeX 表格
【阶段4：解读】分析收敛趋势、瓶颈规模、异常点
【阶段5：下一步】改进建议

规则：
- 每个阶段完成再进入下一阶段
- 实验数据原样呈现，不四舍五入
- 一次只调一个实验，不并发
- 完成后用 polaris_remember 记录实验结果`,
    temperature: 0.2,
    maxTokens: 4096,
  },

  chat: {
    name: '对话模式',
    description: '问候、闲聊、非优化类通用对话',
    tools: [],
    systemPrompt: `你是 Polaris，BitWool Studio 出品的运筹优化科研助手。用中文回复。如果用户只是打招呼或闲聊，友好地介绍自己，并告诉用户你可以帮他求解优化问题、分析问题结构、设计算法、跑实验。`,
    temperature: 0.7,
    maxTokens: 2048,
  },
};

const DEFAULT_SKILL = 'discuss';

class SkillManager {
  constructor() {
    this.currentSkill = DEFAULT_SKILL;
    this.currentPhase = 0;
    this.phaseCompleted = {};
    this.conversationTurn = 0;
    this.lastIntent = null;
  }

  getActive() {
    return SKILLS[this.currentSkill] || SKILLS[DEFAULT_SKILL];
  }

  switchTo(skillName) {
    if (SKILLS[skillName]) {
      if (this.currentSkill !== skillName) {
        this.currentPhase = 0;
        this.phaseCompleted = {};
      }
      this.currentSkill = skillName;
      return true;
    }
    return false;
  }

  /**
   * Run intent classification and auto-switch skill.
   * Returns the effective system prompt for the active skill.
   */
  async getEffectivePrompt(userMessage) {
    this.conversationTurn++;

    // Run the LLM classifier every turn
    try {
      const intent = await classifyIntent(userMessage);
      if (intent && SKILLS[intent] && intent !== this.currentSkill) {
        this.switchTo(intent);
      }
      this.lastIntent = intent;
    } catch {
      // classification failed — stay on current skill
    }

    const skill = this.getActive();
    let prompt = skill.systemPrompt;
    prompt += `\n\n当前对话轮次：第 ${this.conversationTurn} 轮。`;

    const hcResults = require('./health_check').buildAgentCapabilityNote(
      [] // will be filled in router.js via the actual cache
    );

    return prompt;
  }

  advancePhase() {
    const skill = this.getActive();
    const phases = (skill.systemPrompt.match(/【阶段\d+：[^】]+】/g) || []);
    if (this.currentPhase >= phases.length) return null;
    const phaseName = phases[this.currentPhase];
    this.phaseCompleted[this.currentPhase] = true;
    this.currentPhase++;
    return phaseName;
  }

  getPhaseContext() {
    const skill = this.getActive();
    const phases = (skill.systemPrompt.match(/【阶段\d+：[^】]+】/g) || []);
    if (phases.length === 0) return '';
    if (this.currentPhase >= phases.length) return '所有阶段已完成。';
    return `当前阶段：${phases[this.currentPhase]}。请专注完成此阶段。`;
  }

  getActiveTools() {
    return this.getActive().tools || [];
  }
}

module.exports = { SkillManager, SKILLS };

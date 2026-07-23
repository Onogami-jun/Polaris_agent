# Polaris Agent 架构升级方案：学习全球顶级开源 Agent 项目

**撰写日期**：2026-07-23  
**当前 Polaris 版本**：v0.9.0  
**目标**：借鉴开源社区最先进的 Agent 设计模式，重构 Polaris 的 Agent 引擎

---

## 一、值得研究的开源项目

### 1. OpenAI Agents SDK（原 Swarm）

**核心创新**：Handoff（交接）模式——Agent A 完成自己的子任务后，可以将控制权和上下文"交接"给 Agent B。

```python
# OpenAI Agents SDK 的 Handoff 模式
code_agent = Agent(name="Coder", instructions="Write code...")
debug_agent = Agent(name="Debugger", instructions="Find bugs...")

# 手递手交接：代码写完自动递给调试器检查
code_agent.handoffs = [debug_agent]
```

**Polaris 可以学的**：
- 当前 Orchestrator 是"并行分发给多个专家然后缝合"。Handoff 提供了一种新范式：**串行流水线**。写代码 → 审查 → 测试 → 修复。每一环的输出是下一环的输入。
- 实用场景：用户问"写一个算法并确保没有 bug"→ 先调 Coder 写好 → 自动交接给 Reviewer → 有 bug 则回调 Coder 修复 → 最终输出审查过的代码。

### 2. CrewAI

**核心创新**：Role-based Agent Crew with Hierarchical Process。定义每个 Agent 的"Role-Goal-Backstory"，Manager Agent 负责任务派发和质量把关。

```python
# CrewAI 的角色定义
researcher = Agent(role="研究员", goal="找到最准确的信息", backstory="十年行业分析师")
writer = Agent(role="写手", goal="写出引人入胜的内容", backstory="前杂志主编")
crew = Crew(agents=[researcher, writer], process=Process.hierarchical)
```

**Polaris 可以学的**：
- CrewAI 的 **Hierarchical Process**：Manager 先审阅 Worker 输出，不合格则打回重做。这比 Polaris 当前的"并发+简单缝合"更可靠。
- **Backstory 注入**：当前 Polaris 的 EXPERT_PROMPTS 只有一句话。CrewAI 给每个角色写详细的背景故事，输出质量明显更好。

### 3. LangGraph

**核心创新**：Agent 流程 = 有向图。每个节点是一个操作，边是条件跳转。天然支持循环和分支。

```python
# LangGraph 风格的状态机
graph = StateGraph(AgentState)
graph.add_node("classify", classify_intent)
graph.add_node("decompose", decompose_task)
graph.add_node("execute", execute_subtasks)
graph.add_node("synthesize", synthesize_results)
graph.add_conditional_edges("classify", lambda s: "decompose" if s.complex else "execute")
```

**Polaris 可以学的**：
- 当前 Polaris 的 Orchestrator 逻辑是硬编码的 if-else。改成 Graph 模式后，每种意图可以有不同的处理图。
- 你的 Agent 状态机（ready/quiet/meeting/sleep）天然适合 Graph 表示。

### 4. Microsoft Agent Framework

**核心创新**：企业级 Agent 的生产模式——Planning（先做计划）、Tool Calling（执行）、Memory（记忆）、Multi-turn（多轮对话）四层解耦。

**Polaris 可以学的**：
- **Planning 与 Execution 分离**：模型先生成执行计划（结构化 JSON），用户确认后，Agent 严格按计划执行。这比"边想边做"更可控。
- Polaris 的桌面自动化（desktop.js）正需要这个——Agent 操作你的电脑之前，应该先展示计划。

### 5. Open Interpreter

**核心创新**：LLM 直接执行本地代码。Ollama/OpenAI 模型通过 system prompt 知道自己能运行 Python/Shell 命令，然后真的去执行。

**Polaris 可以学的**：
- 当前 Polaris 的 desktop.js 靠 PowerShell + Win32 API。Open Interpreter 的模式更通用——直接用 Python exec() 或 Node.js eval()。
- 安全沙箱：Open Interpreter 有确认机制——任何危险操作（文件删除、系统命令）必须先展示代码等用户批准。

---

## 二、Polaris 具体升级方案

### 升级 1：Expert Agent 系统（借鉴 CrewAI + Swarm）

**当前**：6 个一行 system prompt 的"专家角色"。

**升级后**：每个 Agent 拥有完整定义：

```javascript
const AGENTS = {
  coder: {
    name: "Polaris Coder",
    role: "资深软件工程师",
    goal: "写出可直接运行、零 bug、性能优秀的代码",
    backstory: "10年全栈工程师，精通 Go/Python/TypeScript/Rust，代码洁癖",
    handoffs: ["reviewer"],  // 写完自动交接
    tools: ["run_code", "search_docs"],
    prompt: "你写的每一段代码都要包含错误处理。不确定的 API 用法先查文档。"
  },
  reviewer: {
    name: "Polaris Reviewer", 
    role: "代码审查专家",
    goal: "找出代码中的所有潜在问题——bug、性能、安全、可维护性",
    backstory: "前 Google 代码审查委员会成员，审查过 10000+ PR",
    handoffs: ["coder"],  // 发现问题交回给 coder 修复
    tools: ["run_linter", "security_scan"],
    prompt: "逐行审查。发现一个 bug 就标记一个。不要说'看起来不错'除非真的没有问题。"
  },
  analyst: {
    name: "Polaris Analyst",
    role: "数据分析与商业洞察专家",
    goal: "提供数据驱动的分析，包含具体数字和可操作的建议",
    backstory: "前麦肯锡顾问，擅长将复杂数据转化为决策依据",
    handoffs: ["fact_checker"],
    tools: ["calculate", "chart"],
    prompt: "所有分析必须有数据支撑。预估数字标注为'基于现有信息的估算'。"
  },
  // ...更多 Agent
};
```

### 升级 2：Agent Workflow Graph（借鉴 LangGraph）

把当前硬编码的 Orchestrator 改成可配置的工作流图：

```javascript
// Polaris Workflow Graph
// 不同意图走不同的处理路径

const WORKFLOWS = {
  // 代码生成的串行流水线
  code_generation: {
    nodes: ["decompose", "coder", "reviewer", "fix_coder", "synthesize"],
    edges: [
      { from: "decompose",  to: "coder" },
      { from: "coder",      to: "reviewer" },
      { from: "reviewer",   to: "fix_coder", when: "has_issues" },
      { from: "reviewer",   to: "synthesize", when: "no_issues" },
      { from: "fix_coder",  to: "reviewer" },  // 循环直到通过
    ]
  },
  
  // 高危决策的并行验证
  high_stakes: {
    nodes: ["decompose", "parallel_analyze", "fact_check", "ensemble", "synthesize"],
    edges: [
      { from: "decompose",        to: "parallel_analyze" },
      { from: "parallel_analyze", to: "fact_check" },
      { from: "fact_check",       to: "ensemble", when: "disagree" },
      { from: "fact_check",       to: "synthesize", when: "agree" },
    ]
  },
  
  // 通用对话的直接处理
  general_chat: {
    nodes: ["chat"],
    edges: []
  }
};
```

### 升级 3：Planning before Execution（借鉴 Microsoft Agent Framework）

在桌面自动化之前，先展示计划：

```javascript
// 用户: "帮我把下载文件夹里的所有 PDF 整理到文档目录"
// 
// Polaris 不直接执行，先生成计划:
// 
// [plan]
// 1. 扫描 C:\Users\...\Downloads\*.pdf → 找到 12 个文件
// 2. 创建 C:\Users\...\Documents\PDF 目录（如不存在）
// 3. 移动文件（12个）
// 4. 按日期建立子目录归类
// [/plan]
// 
// 用户确认 → 执行
// 执行中每步显示进度
```

### 升级 4：Tool System（借鉴 Open Interpreter + CrewAI）

每个 Agent 可以声明自己能用的工具：

```javascript
const TOOLS = {
  run_code: { 
    description: "执行代码并返回输出", 
    requires_confirm: true,
    sandbox: true 
  },
  search_web: { 
    description: "联网搜索", 
    requires_confirm: false 
  },
  read_file: { 
    description: "读取本地文件", 
    requires_confirm: true,
    allowed_extensions: [".pdf", ".docx", ".txt", ".md", ".csv"]
  },
  write_file: { 
    description: "写入本地文件", 
    requires_confirm: true,
    allowed_dirs: ["Documents", "Desktop"]
  },
  run_terminal: { 
    description: "执行终端命令", 
    requires_confirm: true,
    blocked_commands: ["rm -rf", "format", "del /f"]
  },
  send_notification: {
    description: "发送系统通知",
    requires_confirm: false
  }
};
```

---

## 三、实现优先级

| 优先级 | 升级项 | 复杂度 | 效果 | 理由 |
|--------|--------|--------|------|------|
| P0 | Expert Agent 系统 | 中 | 高 | 直接提升回答质量，改动最小 |
| P1 | Workflow Graph | 高 | 高 | 核心卖点"多模型协同"的真正实现 |
| P2 | Tool System | 中 | 高 | 让 Agent 从"说话"变成"做事" |
| P3 | Planning before Execution | 中 | 中 | 对桌面自动化场景至关重要 |

---

## 四、与当前代码的对应关系

| 文件 | 当前状态 | 升级方向 |
|------|---------|---------|
| `electron/services/router.js` | 硬编码 6 个 EXPERT_PROMPTS | 迁移到 AGENTS 对象，每个 Agent 含 role/goal/backstory/handoffs/tools |
| `electron/services/router.js` Orchestrator | 硬编码 if-else 拆解逻辑 | 迁移到 WORKFLOWS 图配置，按意图加载不同流程 |
| `electron/services/desktop.js` | PowerShell+Win32 硬编码 | 接入 TOOLS 系统，每个工具带确认机制和安全检查 |
| `src/store/chatSlice.ts` | AgentConfig 只有 name/temperature/style | 加 Agent 选择器、Workflow 可视化 |
| `src/App.tsx` | 回答直接渲染 Markdown | 加 Plan 卡片渲染、Tool 执行状态展示 |

---

## 后续建议

1. **不要引入 Python 依赖**。CrewAI/LangGraph 是 Python 框架，但 Polaris 是纯 JS 的。我们把它们的**设计思想**移植过来，用纯 JS 实现，不装任何 Python 运行时。
2. **从 Expert Agent 系统开始**。这是改动最小、效果最明显的升级。改 `router.js` 里的 EXPERT_PROMPTS → AGENTS，前端不需要动。
3. **Groq/Anthropic 开源模型关注**。Groq 的 Llama 3.1 免费 API 我们已经接入过（之前的本地 fallback）。Grok-1 的权重是开源的但 314B 参数太大了，不适合本地跑。真正能本地跑的是 llama.cpp 系的模型。

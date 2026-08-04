# 顶级 AI Agent 架构分析 & Polaris 优化路线

**撰写日期**：2026-08-04 · 基于 2026 年最新开源 Agent 框架研究

---

## 一、五个顶级架构，五种设计哲学

### 1. Claude Code：while(true) 循环 + 工具原子化

Anthropic 在 2025 年发布的《Seeing like an agent》是 agent 工具设计的圣经级文档。

**核心洞察**：不要为 agent 设计"你认为它需要"的工具，而是要"像 agent 一样思考"——agent 在面对任务时，每一步需要什么信息、什么操作能力？

**架构要点**：
- **单一 while 循环**替代状态机。一个 1,400 行的 while(true) 循环，agent 在每一步: 思考 → 调用工具 → 观察结果 → 决定下一步。没有预定义的流程图，agent 自主决定路径。
- **工具原子化**：每个工具只做一件事且做好。`Read` 只读文件，`Write` 只写文件，`Bash` 只跑命令。组合工具由 agent 自己决策，不由代码预设。
- **Sub-agent 隔离上下文**：主 agent 遇到复杂子任务时 spawn 一个独立 agent，子 agent 在自己的上下文窗口中工作，只把最终结果返回主 agent。避免上下文污染。

**对 Polaris 的启示**：
- Polaris 当前的 `runAgentLoop` 已经是一个 tool loop，但只有 3 轮。Claude Code 的做法是"不设上限，agent 自己判断何时结束"，更灵活。
- Sub-agent 模式：Polaris 的 `subagents.js` 有雏形但没接入主循环。应该让主 router 在检测到复杂子任务时自动 spawn sub-agent。

---

### 2. OpenAI Agents SDK：Handoff 交接模式

OpenAI 在 2025 年 3 月开源了 Agents SDK（前身是 Swarm 实验项目）。

**核心创新**：Handoff（交接）——Agent A 完成子任务后，将**控制权 + 上下文**一起转交给 Agent B。

```python
# OpenAI Agents SDK 的 Handoff
code_agent = Agent(name="Coder", instructions="Write code...")
debug_agent = Agent(name="Debugger", instructions="Find bugs...")
code_agent.handoffs = [debug_agent]  # 写完自动交给 debugger
```

**和 Polaris 当前 Handoff 的区别**：
- Polaris 的 handoffs 只是配置文件里的字符串数组，没有运行时执行
- OpenAI 的 handoff 是**真正发生**的：上下文、对话历史、工具调用记录全部传递给下一个 agent
- Handoff 可以带 filter：`handoff(debug_agent, input_filter=lambda ctx: ctx["code"])` 只传代码，不传整个对话

**对 Polaris 的启示**：
- 把 `agents.js` 的 handoffs 从"声明式元数据"升级为"运行时能力"
- 核心改造：router.js 的 agent loop 中，tool call 执行完后检查当前 agent 是否应 handoff

---

### 3. CrewAI：Manager-Worker 层级式质量把关

CrewAI 在 2026 年仍然是多 agent 框架的标杆。

**核心创新**：Hierarchical Process——Manager Agent 不仅有任务派发，还有**质量审核**。

```
用户请求
  │
  ▼
Manager Agent（审阅 → 派发 → 审核 → 通过/打回）
  │
  ├── Worker Agent 1（研究员）
  ├── Worker Agent 2（写手）
  └── Worker Agent 3（审查员）
```

**关键机制**：
- Manager 收到 Worker 输出后，不直接返回用户，先自我审核：回答是否完整？是否有事实错误？是否需要补充？
- 不合格 → 打回 Worker 重做，带上具体反馈
- 合格 → 整合多个 Worker 输出，生成最终回复

**对 Polaris 的启示**：
- Polaris 当前在 `runAgentLoop` 里是"调工具→拼结果→返回"，没有质量把关环节
- 应该在 tool loop 之后加一个 **Quality Check 步骤**：把结果发给 LLM 自检，不合格则回到求解步骤

---

### 4. Claude Code Dynamic Workflows：意图驱动的工作流

Claude Code 在 2026 年新增了 Dynamic Workflows。

**核心创新**：不需要预定义 workflow 图，agent 根据任务**动态规划**步骤。

```
用户: "把数据迁移到新表，并更新所有引用"
  │
  ▼
Agent 自主规划:
  1. 扫描代码库找到旧表引用
  2. 创建新表 schema
  3. 写迁移脚本
  4. 更新所有引用
  5. 跑测试验证
```

**和 Polaris 当前 Planner 的对比**：
- Polaris 的 Planner 有 3 个固定模板（experiment / method_compare / paper_prep），超出模板的任务走 default 流
- Claude Code 的做法是**让 LLM 自己生成步骤列表**，不依赖预定义模板

**对 Polaris 的启示**：
- 在 Planner 的 `generatePlan` 中，对于无法匹配模板的请求，调用一次 LLM 动态生成步骤列表，而非直接降级到 default

---

### 5. LangGraph：有向图 + 条件边

LangGraph 把 agent 流程建模为**有向图**：节点 = 操作，边 = 条件跳转。

```python
graph = StateGraph(AgentState)
graph.add_node("classify", classify_intent)
graph.add_node("solve", solve_problem)
graph.add_node("verify", verify_result)
graph.add_node("explain", explain_solution)

# 条件边：验证通过 → 解释，验证失败 → 回到求解
graph.add_conditional_edges("verify",
    lambda s: "explain" if s.verified else "solve"
)
```

**和 Polaris 当前 Workflow 的对比**：
- Polaris 的 `workflow.js` 已经有条件路由（`nextWhen`），但只在 `executeWorkflow` 函数里用了一次
- LangGraph 把条件边作为一等公民，每个节点都可以有分支

---

## 二、Polaris 当前的短板对照

| 维度 | 顶级项目怎么做 | Polaris 当前状态 |
|------|--------------|-----------------|
| Agent Loop | while(true) 不限轮次 | 最多 3 轮 tool loop |
| Handoff | 运行时上下文传递 | 元数据声明，未执行 |
| Sub-agent | 独立上下文窗口 | `subagents.js` 有雏形，未接入 |
| 质量把关 | Manager 审核 + 打回重做 | 无，结果直接返回 |
| 工作流 | LLM 动态生成步骤 | 3 个固定模板 |
| 工具设计 | 原子化 + agent 视角 | 14 个工具，有些过于复杂 |
| 上下文管理 | 子 agent 隔离 + 记忆压缩 | 依赖 LLM 自身的 context window |
| 可靠性 | Circuit Breaker + 多路径 | Polaris 已有！这个做得不错 |

---

## 三、Polaris 的具体优化方案（按投入产出排序）

### P0：Agent Loop 去轮次上限 + Handoff 运行时化

改 `router.js` 的 `runAgentLoop`:

```javascript
// 当前: for (let round = 0; round < 3; round++)
// 改为: while (true)，由 LLM 的 finish_reason 或特殊标记决定退出

// 当前: handoffs 只是 agents.js 里的字符串数组
// 改为: 每个 tool call 返回后检查 agent.handoffs 是否触发
```

**改法**：让 LLM 在回复中输出 `[DONE]` 标记来结束循环，否则继续调工具。同时如果当前 agent 的 tool call 全部成功且某个 handoff target 的 prompt 更匹配下一步，就自动切换 agent。

### P1：主循环加 Quality Check 步骤

在 `runAgentLoop` 的 tool 执行完之后、返回给用户之前，加一个快速的质量检查：

```javascript
// 把 tool 结果 + 用户原问题发给 LLM，问一句:
// "这个回答解决了用户的问题吗？如果有遗漏，补充什么？"
// 如果 LLM 说不完整 → 继续 loop
```

### P2：Planner 动态步骤生成

当前的 `generatePlan` 对非模板请求直接降级为 default。改为调用一次 LLM：

```javascript
// Prompt: "用户在 Polaris Solver 中说：{text}。请列出完成此任务需要的步骤列表（每行一个步骤）。"
// LLM 返回 → 解析为 steps 数组 → 生成 plan
```

### P3：Sub-agent 隔离上下文

把 `subagents.js` 的 `runPipeline` 接入主 router。当 agent loop 检测到某个子任务需要大量上下文时（如"分析这个 200 行的输出"），spawn 一个 sub-agent 处理，只把摘要返回。

---

## 四、建议实施顺序

1. **P0**（半天）：Agent Loop 去轮次上限 + 让 LLM 自己决定何时结束。改动集中在 `router.js` 的 `runAgentLoop`，约 20 行。
2. **P1**（半天）：Quality Check 步骤。在 `runAgentLoop` 返回前加一次自检 LLM 调用。约 30 行。
3. **P2**（1 小时）：Planner 动态步骤。改 `planner.js` 的 `generatePlan` 的 fallback 分支。约 20 行。
4. **P3**（半天）：Sub-agent 接入主循环。改动 `router.js` + `subagents.js`。约 50 行。

你想从哪个开始？还是全部一起上？

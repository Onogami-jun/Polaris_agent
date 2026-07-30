<p align="center">
  <img src="icon.png" width="96" alt="Polaris Logo" />
</p>

<h1 align="center">Polaris Solver</h1>
<p align="center">Optimization Research Agent · 运筹优化科研助手</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.6.0-blue" />
  <img src="https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-lightgrey" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
  <img src="https://img.shields.io/badge/python-3.11%2B-orange" />
  <img src="https://img.shields.io/badge/electron-31-blueviolet" />
</p>

---

[English](#english) · [中文](#chinese)

---

## English

Polaris Solver is an optimization research agent that bridges natural language and combinatorial optimization. Describe your problem in plain language—knapsack, scheduling, assignment, facility location, VRP—and Polaris automatically models, solves, and outputs publication-ready results.

### Features

- **Natural Language Input** — Describe optimization problems in Chinese or English
- **7 Problem Templates** — Knapsack, Assignment, Scheduling, Facility Location, Multi-Knapsack, Set Covering, CVRP
- **Triple Engine Solver** — HiGHS (MIT), Benders Decomposition, Column Generation
- **Structural Analysis** — Automatic detection of block-angular, time-indexed, and other algebraic structures
- **Batch Experimentation** — One-command comparison across solvers, scales, and parameters; outputs Markdown & LaTeX tables
- **Desktop Agent** — Electron app with tool execution tracking, skill-based mode switching, and subagent pipeline
- **Python Library** — `pip install polaris-opt[highs]` for use in any Python environment

### Architecture

```
User Input (NL)
     │
     ▼
┌─────────────┐    ┌──────────────┐    ┌───────────────┐
│ L0: Semantic │ →  │ L1: Canonical│ →  │ L2: Structure │
│ Classifier   │    │ Model        │    │ Analyzer      │
└─────────────┘    └──────────────┘    └───────────────┘
                                                │
                          ┌─────────────────────┘
                          ▼
┌──────────────────────────────────────────────────┐
│ L3: Decomposition Engine                        │
│  · Direct Solve (HiGHS)                         │
│  · Benders Decomposition                        │
│  · Column Generation                            │
│  · Branch & Bound                               │
└──────────────────────────────────────────────────┘
```

### Quick Start

**Desktop App**

Download from [Releases](https://github.com/D0gSXG/Polaris_agent/releases) for your platform.

**Python Library**

```bash
pip install polaris-opt[highs]
```

```python
from polaris import solve
print(solve("3 items, values 60 100 120, weights 10 20 30, capacity 50"))
# → Select item 2 and 3, total value = 220
```

### Tech Stack

Python 3.11+ · HiGHS · Electron 31 · React 18 · TypeScript · Tailwind CSS · shadcn/ui · DeepSeek V4

---

## 中文

Polaris Solver 是一个运筹优化科研助手。用自然语言描述优化问题，Polaris 自动建模、分解求解并输出论文级结果。

### 功能

- **自然语言驱动** — 用中文或英文描述优化问题
- **7 类问题模板** — 背包、指派、单机排产、设施选址、多背包、集合覆盖、CVRP
- **三层求解引擎** — HiGHS（MIT 免费）、Benders 分解、Column Generation
- **自动结构分析** — 检测 block-angular、time-indexed 等代数结构，推荐分解策略
- **批量实验自动化** — 一句话对比多求解器、多规模、多参数，输出 Markdown 与 LaTeX 表格
- **桌面 Agent** — Electron 桌面应用，带工具执行追踪、技能模式切换与子代理流水线
- **Python 库** — `pip install polaris-opt[highs]` 即可在任何 Python 环境中使用

### 架构

```
用户输入（自然语言）
       │
       ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│ L0: 语义 │→  │ L1: 规范 │→  │ L2: 结构 │
│ 意图分类 │   │ 优化模型 │   │ 分析器   │
└──────────┘   └──────────┘   └──────────┘
                                  │
              ┌───────────────────┘
              ▼
┌─────────────────────────────────────┐
│ L3: 分解求解引擎                    │
│  · 直接求解（HiGHS）                │
│  · Benders 分解                     │
│  · Column Generation                │
│  · Branch & Bound                   │
└─────────────────────────────────────┘
```

### 快速开始

**桌面应用**

从 [Releases](https://github.com/D0gSXG/Polaris_agent/releases) 下载对应平台的安装包。

**Python 库**

```bash
pip install polaris-opt[highs]
```

```python
from polaris import solve
print(solve("背包容量50，价值60 100 120，重量10 20 30"))
# → 选中第2项和第3项，总价值 = 220
```

### 技术栈

Python 3.11+ · HiGHS · Electron 31 · React 18 · TypeScript · Tailwind CSS · shadcn/ui · DeepSeek V4

---

### License

MIT © [Bitwool](https://bitwool.cn)

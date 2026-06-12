# AutoRuner4Test Phase 3 — 扩展组件（Skills + Hooks + MCPs + Rules）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 7 个 Skill、3 个 Hook、4 个 MCP、3 个 Rule，构成完整的测试全流程组件库。

**Architecture:** 每个组件是独立目录，包含 manifest.json（元数据+配置 schema）+ 主文件（skill=markdown 指令, hook=JS 脚本, mcp=server 实现, rule=约束规则）。Orchestrator 按任务组装 `.claude/` 目录注入 Claude Code 实例。

**Tech Stack:** TypeScript (MCP servers), Markdown (Skills/Rules), JavaScript (Hooks)

**Depends on:** Phase 1 后端核心（组件 Registry API、Claude 实例管理器）

---

## 文件结构

```
components/
├── skills/
│   ├── requirement-analysis/
│   │   ├── manifest.json
│   │   └── instruction.md
│   ├── testcase-generator/
│   │   ├── manifest.json
│   │   └── instruction.md
│   ├── script-converter/
│   │   ├── manifest.json
│   │   └── instruction.md
│   ├── jenkins-trigger/
│   │   ├── manifest.json
│   │   └── instruction.md
│   ├── report-analyzer/
│   │   ├── manifest.json
│   │   └── instruction.md
│   ├── issue-triage/
│   │   ├── manifest.json
│   │   └── instruction.md
│   └── knowledge-capture/
│       ├── manifest.json
│       └── instruction.md
├── hooks/
│   ├── task-state-hook/
│   │   ├── manifest.json
│   │   └── index.js
│   ├── review-request-hook/
│   │   ├── manifest.json
│   │   └── index.js
│   └── knowledge-distill-hook/
│       ├── manifest.json
│       └── index.js
├── mcps/
│   ├── jenkins-mcp/
│   │   ├── manifest.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── defect-mcp/
│   │   ├── manifest.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── knowledge-mcp/
│   │   ├── manifest.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   └── vcs-mcp/
│       ├── manifest.json
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts
└── rules/
    ├── test-script-standard/
    │   ├── manifest.json
    │   └── rule.md
    ├── defect-format/
    │   ├── manifest.json
    │   └── rule.md
    └── knowledge-schema/
        ├── manifest.json
        └── rule.md
```

---

### Task 1: Skill — requirement-analysis

**Files:**
- Create: `components/skills/requirement-analysis/manifest.json`
- Create: `components/skills/requirement-analysis/instruction.md`

- [ ] **Step 1: 写 manifest.json**

```json
{
  "id": "skill-requirement-analysis",
  "name": "requirement-analysis",
  "type": "skill",
  "version": "1.0.0",
  "description": "解析需求文档，识别功能点、边界条件、隐含约束",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "max_function_points": {
        "type": "number",
        "title": "最大功能点数",
        "default": 50,
        "description": "单次分析识别的功能点上限"
      },
      "include_implicit_constraints": {
        "type": "boolean",
        "title": "识别隐含约束",
        "default": true,
        "description": "是否分析需求文档中未显式声明的约束条件"
      },
      "output_format": {
        "type": "string",
        "title": "输出格式",
        "enum": ["structured", "narrative"],
        "default": "structured"
      }
    }
  },
  "dependencies": []
}
```

- [ ] **Step 2: 写 instruction.md**

```markdown
# 需求分析 Skill

你是一个需求分析专家。你的任务是解析用户提交的需求文档，输出结构化的需求分析结果。

## 输入

需求文档（文本、Markdown 或 PDF 提取内容），通过任务上下文传入。

## 输出格式

必须输出以下结构化 JSON：

\```json
{
  "summary": "需求概要（一句话）",
  "function_points": [
    {
      "id": "FP-001",
      "name": "功能点名称",
      "description": "详细描述",
      "priority": "high|medium|low",
      "type": "core|edge_case|implicit"
    }
  ],
  "boundary_conditions": [
    {
      "related_fp": "FP-001",
      "condition": "边界条件描述",
      "expected_behavior": "预期行为"
    }
  ],
  "implicit_constraints": [
    {
      "category": "performance|security|compatibility|usability",
      "description": "隐含约束描述",
      "rationale": "推断依据"
    }
  ],
  "ambiguities": [
    {
      "description": "模糊之处",
      "suggestion": "建议澄清方向"
    }
  ],
  "assumptions": [
    "基于文档做出的合理假设"
  ]
}
\```

## 分析步骤

1. 通读需求文档，标记核心功能段落
2. 识别功能点，按核心/边界/隐含分类
3. 为每个功能点提取边界条件
4. 推断隐含约束（性能、安全、兼容性）
5. 标记模糊之处，给出澄清建议
6. 列出分析假设

## 规则

- 每个功能点必须有唯一 ID（FP-XXX 格式）
- 边界条件必须关联到具体功能点
- 不猜测需求，模糊处标记为 ambiguity
- 输出必须是合法 JSON
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add components/skills/requirement-analysis/
git commit -m "feat: add requirement-analysis skill component"
```

---

### Task 2: Skill — testcase-generator

**Files:**
- Create: `components/skills/testcase-generator/manifest.json`
- Create: `components/skills/testcase-generator/instruction.md`

- [ ] **Step 1: 写 manifest.json**

```json
{
  "id": "skill-testcase-generator",
  "name": "testcase-generator",
  "type": "skill",
  "version": "1.0.0",
  "description": "基于结构化需求生成测试用例（等价类、边界值、正交法）",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "methods": {
        "type": "string",
        "title": "用例设计方法",
        "enum": ["equivalence_boundary", "orthogonal", "all_pairs", "comprehensive"],
        "default": "equivalence_boundary",
        "description": "等价类+边界值 / 正交法 / 配对测试 / 综合"
      },
      "coverage_target": {
        "type": "number",
        "title": "覆盖目标(%)",
        "default": 85
      }
    }
  },
  "dependencies": ["skill-requirement-analysis"]
}
```

- [ ] **Step 2: 写 instruction.md**

```markdown
# 用例生成 Skill

你是一个测试用例设计专家。基于结构化需求分析结果，生成高质量的测试用例集。

## 输入

结构化需求 JSON（来自 requirement-analysis 任务的产出物）。

## 输出格式

\```json
{
  "test_suite": {
    "name": "测试套件名称",
    "based_on": "需求分析产出ID",
    "design_method": "equivalence_boundary|orthogonal|all_pairs|comprehensive",
    "cases": [
      {
        "id": "TC-001",
        "title": "用例标题",
        "related_fp": "FP-001",
        "priority": "high|medium|low",
        "type": "positive|negative|boundary|edge",
        "preconditions": "前置条件",
        "steps": [
          { "step": 1, "action": "操作描述", "expected": "预期结果" }
        ],
        "data_setup": {
          "test_data": "测试数据描述"
        }
      }
    ]
  },
  "coverage_matrix": {
    "total_fps": 10,
    "covered_fps": 9,
    "uncovered_fps": ["FP-007"],
    "coverage_pct": 90
  }
}
\```

## 用例设计步骤

1. 读取结构化需求，提取功能点和边界条件
2. 按选定方法设计用例：
   - 等价类+边界值：为每个输入划分等价类，取边界值
   - 正交法：多因素组合时用正交表缩减
   - 配对测试：确保任意两因素的所有组合被覆盖
3. 为每个功能点至少生成：1个正向 + 1个反向 + 边界用例
4. 编写覆盖矩阵，标注未覆盖的功能点
5. 达到覆盖目标或标注无法达标的理由

## 规则

- 用例 ID 格式：TC-XXX
- 每个用例必须关联到至少一个功能点（related_fp）
- 步骤必须可执行、预期结果必须可验证
- 不遗漏 boundary_conditions 中的条目
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add components/skills/testcase-generator/
git commit -m "feat: add testcase-generator skill component"
```

---

### Task 3: Skill — script-converter / jenkins-trigger / report-analyzer / issue-triage / knowledge-capture

**Files:**
- Create: 5 个 skill 目录，各含 manifest.json + instruction.md

- [ ] **Step 1: 写 script-converter**

`components/skills/script-converter/manifest.json`:

```json
{
  "id": "skill-script-converter",
  "name": "script-converter",
  "type": "skill",
  "version": "1.0.0",
  "description": "将自然语言测试用例转换为自动化测试脚本",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "framework": {
        "type": "string",
        "title": "测试框架",
        "enum": ["pytest", "jest", "testng", "robot"],
        "default": "pytest"
      },
      "target_repo": {
        "type": "string",
        "title": "目标代码仓库路径",
        "description": "已有自动化项目的 git 仓库路径"
      },
      "follow_conventions": {
        "type": "boolean",
        "title": "遵循团队编码规范",
        "default": true
      }
    }
  },
  "dependencies": ["skill-testcase-generator"]
}
```

`components/skills/script-converter/instruction.md`:

```markdown
# 脚本转换 Skill

你是一个自动化测试脚本编写专家。将测试用例集转换为可执行的自动化脚本。

## 输入

测试用例 JSON（来自 testcase-generator 任务的产出物）。

## 工作流程

1. 读取测试用例集
2. 如配置了 target_repo，先读取已有脚本的结构和风格
3. 按指定框架生成脚本代码
4. 确保脚本符合团队规范（如启用 follow_conventions）
5. 输出可直接执行的脚本文件

## 输出

将脚本文件写入工作目录，输出 JSON 索引：

\```json
{
  "scripts": [
    {
      "file": "test_login.py",
      "related_cases": ["TC-001", "TC-002"],
      "framework": "pytest"
    }
  ],
  "total_scripts": 5,
  "total_cases_covered": 20
}
\```

## 规则

- 脚本必须可独立运行（不依赖未声明的 fixture 或工具）
- 每个 test 函数对应一个或多个用例，注释标注 TC-ID
- 断言必须明确，不用 assertTrue 无信息断言
- 如引用 target_repo 的 page object 或工具类，确保路径正确
```

- [ ] **Step 2: 写 jenkins-trigger**

`components/skills/jenkins-trigger/manifest.json`:

```json
{
  "id": "skill-jenkins-trigger",
  "name": "jenkins-trigger",
  "type": "skill",
  "version": "1.0.0",
  "description": "调用 Jenkins API 触发构建并监控执行状态",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "jenkins_url": {
        "type": "string",
        "title": "Jenkins 地址",
        "default": ""
      },
      "job_name": {
        "type": "string",
        "title": "Job 名称"
      },
      "parameters": {
        "type": "string",
        "title": "构建参数(JSON)",
        "description": "传递给 Jenkins 构建的参数，JSON 格式"
      }
    }
  },
  "dependencies": ["mcp-jenkins"]
}
```

`components/skills/jenkins-trigger/instruction.md`:

```markdown
# Jenkins 触发 Skill

你负责触发 Jenkins 构建任务并等待执行完成。

## 输入

脚本文件路径和 Jenkins 配置。

## 工作流程

1. 使用 jenkins-mcp 工具触发构建
2. 轮询构建状态直到完成
3. 获取构建结果和报告 URL
4. 输出构建摘要

## 输出

\```json
{
  "build_number": 123,
  "status": "SUCCESS|FAILURE|UNSTABLE|ABORTED",
  "duration_ms": 45000,
  "report_url": "https://jenkins.example.com/job/xxx/123/",
  "console_log_tail": "最后 20 行日志"
}
\```

## 规则

- 构建失败时，提取关键错误信息
- 不无限等待，默认超时 30 分钟
- 保留完整 console log 引用
```

- [ ] **Step 3: 写 report-analyzer**

`components/skills/report-analyzer/manifest.json`:

```json
{
  "id": "skill-report-analyzer",
  "name": "report-analyzer",
  "type": "skill",
  "version": "1.0.0",
  "description": "分析 Jenkins 执行报告，识别失败根因，分类问题",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "failure_categories": {
        "type": "string",
        "title": "失败分类标准",
        "enum": ["env_code_case", "severity", "component"],
        "default": "env_code_case",
        "description": "环境/代码/用例 / 严重程度 / 组件维度"
      },
      "include_suggestions": {
        "type": "boolean",
        "title": "包含修复建议",
        "default": true
      }
    }
  },
  "dependencies": ["skill-jenkins-trigger"]
}
```

`components/skills/report-analyzer/instruction.md`:

```markdown
# 报告分析 Skill

你负责分析测试执行报告，识别失败根因并进行分类。

## 输入

Jenkins 构建结果（来自 jenkins-trigger 任务的产出物）。

## 工作流程

1. 读取测试报告（JUnit XML、Allure 等）
2. 识别所有失败用例
3. 分析失败根因（环境问题 / 代码缺陷 / 用例问题）
4. 提供修复建议
5. 输出分析报告

## 输出

\```json
{
  "summary": {
    "total": 100,
    "passed": 92,
    "failed": 5,
    "skipped": 3,
    "pass_rate": 0.92
  },
  "failures": [
    {
      "test_case": "TC-015",
      "failure_type": "assertion_error|timeout|environment|flaky",
      "root_cause": "根因描述",
      "category": "env|code|case",
      "severity": "blocker|critical|major|minor",
      "suggestion": "修复建议",
      "stack_trace": "关键堆栈"
    }
  ],
  "environment_issues": ["环境问题列表"],
  "flaky_suspects": ["可能不稳定的用例"]
}
\```

## 分类规则

- **env**: 基础设施、环境配置、网络导致
- **code**: 产品代码缺陷
- **case**: 用例本身有问题（数据、逻辑、过时）
- 不确定时归为 case，标注需确认
```

- [ ] **Step 4: 写 issue-triage**

`components/skills/issue-triage/manifest.json`:

```json
{
  "id": "skill-issue-triage",
  "name": "issue-triage",
  "type": "skill",
  "version": "1.0.0",
  "description": "对确认的问题生成缺陷描述并判断是否提单",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "target_system": {
        "type": "string",
        "title": "缺陷系统",
        "enum": ["jira", "tapd", "none"],
        "default": "none",
        "description": "提单目标系统，none 表示仅生成不提单"
      },
      "auto_file_threshold": {
        "type": "string",
        "title": "自动提单阈值",
        "enum": ["blocker", "critical", "major"],
        "default": "blocker",
        "description": "达到此严重程度自动提单，低于此需人工确认"
      }
    }
  },
  "dependencies": ["skill-report-analyzer", "mcp-defect"]
}
```

`components/skills/issue-triage/instruction.md`:

```markdown
# 提单处理 Skill

你负责对确认的问题生成规范的缺陷描述，并判断是否需要提单。

## 输入

报告分析结果中 category=code 且已人工确认的失败条目。

## 工作流程

1. 读取确认的问题列表
2. 为每个问题生成缺陷描述
3. 判断严重程度，决定是否提单
4. 如配置了缺陷系统且达到阈值，调用 MCP 提单
5. 输出提单结果

## 缺陷描述格式

每个缺陷必须包含：

- **标题**：简洁的问题描述
- **复现步骤**：可执行的步骤序列
- **预期结果**：正确行为
- **实际结果**：观察到的错误行为
- **环境信息**：版本、环境、配置
- **附件**：截图/日志引用

## 输出

\```json
{
  "issues": [
    {
      "title": "登录页面在 Chrome 118 下输入框无法获取焦点",
      "severity": "major",
      "filed": true,
      "issue_key": "PROJ-1234",
      "filed_system": "jira"
    }
  ],
  "skipped": [
    {
      "title": "xxx",
      "reason": "低于自动提单阈值，需人工确认"
    }
  ]
}
\```
```

- [ ] **Step 5: 写 knowledge-capture**

`components/skills/knowledge-capture/manifest.json`:

```json
{
  "id": "skill-knowledge-capture",
  "name": "knowledge-capture",
  "type": "skill",
  "version": "1.0.0",
  "description": "从任务产出物中提炼可复用知识，写入知识库",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "knowledge_types": {
        "type": "string",
        "title": "提取类型",
        "enum": ["all", "pattern", "lesson", "defect_pattern"],
        "default": "all"
      },
      "min_confidence": {
        "type": "number",
        "title": "最低置信度",
        "default": 0.7,
        "description": "只有达到此置信度的知识才会写入"
      }
    }
  },
  "dependencies": ["mcp-knowledge"]
}
```

`components/skills/knowledge-capture/instruction.md`:

```markdown
# 知识沉淀 Skill

你负责从任务执行过程中提炼可复用知识。

## 输入

当前任务的所有产出物和上下文信息。

## 工作流程

1. 回顾任务类型和产出物
2. 提炼知识条目：
   - **pattern**: 发现的可复用模式
   - **lesson**: 经验教训
   - **defect_pattern**: 缺陷模式（同类问题的共性）
3. 评估每条知识的置信度和适用范围
4. 写入知识库

## 知识条目格式

\```markdown
---
type: pattern|lesson|defect_pattern
source_task: task-uuid
tags: [tag1, tag2]
created: YYYY-MM-DD
confidence: 0.8
---

## 问题
描述

## 根因
分析

## 解法
方案

## 适用场景
何时复用
\```

## 规则

- 知识条目必须包含完整四段（问题/根因/解法/适用场景）
- 标签从任务上下文提取，不凭空编造
- 置信度低于阈值的不写入，记录为候选
```

- [ ] **Step 6: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add components/skills/
git commit -m "feat: add all 7 skill components"
```

---

### Task 4: Hooks — task-state / review-request / knowledge-distill

**Files:**
- Create: 3 个 hook 目录，各含 manifest.json + index.js

- [ ] **Step 1: 写 task-state-hook**

`components/hooks/task-state-hook/manifest.json`:

```json
{
  "id": "hook-task-state",
  "name": "task-state-hook",
  "type": "hook",
  "version": "1.0.0",
  "description": "任务状态变更时更新数据库并通知前端",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "notify_frontend": {
        "type": "boolean",
        "title": "通知前端",
        "default": true
      }
    }
  },
  "dependencies": [],
  "events": ["task:status-changed"]
}
```

`components/hooks/task-state-hook/index.js`:

```javascript
/**
 * task-state-hook
 * 任务状态变更时：更新 DB + WebSocket 通知前端
 */
module.exports = async function handleTaskStateChange(event) {
  const { taskId, from, to, timestamp } = event.data

  // 更新数据库
  const db = require('../../server/src/db/client')
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(to, timestamp || new Date().toISOString(), taskId)

  // WebSocket 通知
  if (event.config?.notify_frontend !== false) {
    const { broadcast } = require('../../server/src/ws/handler')
    broadcast({
      event: 'task:status-changed',
      taskId,
      data: { from, to },
    })
  }

  return { handled: true }
}
```

- [ ] **Step 2: 写 review-request-hook**

`components/hooks/review-request-hook/manifest.json`:

```json
{
  "id": "hook-review-request",
  "name": "review-request-hook",
  "type": "hook",
  "version": "1.0.0",
  "description": "任务到达确认节点时通知前端等待人工确认",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "auto_highlight": {
        "type": "boolean",
        "title": "自动高亮",
        "default": true,
        "description": "在 Dashboard 自动高亮待确认任务"
      }
    }
  },
  "dependencies": [],
  "events": ["task:status-changed"]
}
```

`components/hooks/review-request-hook/index.js`:

```javascript
/**
 * review-request-hook
 * 任务状态变为 review 时，通知前端等待人工确认
 */
module.exports = async function handleReviewRequest(event) {
  const { taskId, to } = event.data

  if (to !== 'review') return { handled: false }

  const { broadcast } = require('../../server/src/ws/handler')
  broadcast({
    event: 'task:review-requested',
    taskId,
    data: { status: 'review', timestamp: new Date().toISOString() },
  })

  return { handled: true }
}
```

- [ ] **Step 3: 写 knowledge-distill-hook**

`components/hooks/knowledge-distill-hook/manifest.json`:

```json
{
  "id": "hook-knowledge-distill",
  "name": "knowledge-distill-hook",
  "type": "hook",
  "version": "1.0.0",
  "description": "检查未蒸馏痕迹数量，达阈值提醒知识沉淀",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "threshold": {
        "type": "number",
        "title": "提醒阈值",
        "default": 5,
        "description": "未蒸馏痕迹达到此数量时提醒"
      }
    }
  },
  "dependencies": [],
  "events": ["artifact:created"]
}
```

`components/hooks/knowledge-distill-hook/index.js`:

```javascript
/**
 * knowledge-distill-hook
 * 产出物写入时检查未蒸馏痕迹数量，达阈值提醒
 */
module.exports = async function handleKnowledgeDistill(event) {
  const config = event.config || {}
  const threshold = config.threshold || 5

  const db = require('../../server/src/db/client')
  const count = db.prepare(
    'SELECT COUNT(*) as cnt FROM knowledge WHERE distilled = 0'
  ).get().cnt

  if (count >= threshold) {
    const { broadcast } = require('../../server/src/ws/handler')
    broadcast({
      event: 'knowledge:distill-needed',
      taskId: null,
      data: { unprocessed_count: count, threshold },
    })
  }

  return { handled: count >= threshold }
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add components/hooks/
git commit -m "feat: add 3 hook components (task-state, review-request, knowledge-distill)"
```

---

### Task 5: MCP — jenkins-mcp

**Files:**
- Create: `components/mcps/jenkins-mcp/manifest.json`
- Create: `components/mcps/jenkins-mcp/package.json`
- Create: `components/mcps/jenkins-mcp/tsconfig.json`
- Create: `components/mcps/jenkins-mcp/src/index.ts`

- [ ] **Step 1: 写 manifest.json**

```json
{
  "id": "mcp-jenkins",
  "name": "jenkins-mcp",
  "type": "mcp",
  "version": "1.0.0",
  "description": "Jenkins API 集成：触发构建、查询状态、获取报告",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "jenkins_url": {
        "type": "string",
        "title": "Jenkins 服务器地址"
      },
      "username": {
        "type": "string",
        "title": "用户名"
      },
      "api_token": {
        "type": "string",
        "title": "API Token"
      }
    },
    "required": ["jenkins_url", "username", "api_token"]
  },
  "dependencies": [],
  "transport": "stdio"
}
```

- [ ] **Step 2: 写 package.json**

```json
{
  "name": "jenkins-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 3: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 写 src/index.ts**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

// 配置从环境变量读取（由 Orchestrator 注入）
const JENKINS_URL = process.env.JENKINS_URL || ''
const JENKINS_USER = process.env.JENKINS_USERNAME || ''
const JENKINS_TOKEN = process.env.JENKINS_API_TOKEN || ''

function authHeaders(): Record<string, string> {
  const encoded = Buffer.from(`${JENKINS_USER}:${JENKINS_TOKEN}`).toString('base64')
  return { Authorization: `Basic ${encoded}` }
}

async function jenkinsFetch(path: string, opts?: RequestInit) {
  const url = `${JENKINS_URL}${path}`
  const res = await fetch(url, {
    ...opts,
    headers: { ...authHeaders(), ...opts?.headers },
  })
  if (!res.ok) throw new Error(`Jenkins API error: ${res.status} ${res.statusText}`)
  return res.json()
}

const server = new Server(
  { name: 'jenkins-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'trigger_build',
      description: '触发 Jenkins 构建',
      inputSchema: {
        type: 'object',
        properties: {
          job_name: { type: 'string', description: 'Job 名称' },
          parameters: { type: 'object', description: '构建参数' },
        },
        required: ['job_name'],
      },
    },
    {
      name: 'get_build_status',
      description: '查询构建状态',
      inputSchema: {
        type: 'object',
        properties: {
          job_name: { type: 'string' },
          build_number: { type: 'number' },
        },
        required: ['job_name', 'build_number'],
      },
    },
    {
      name: 'get_build_report',
      description: '获取构建测试报告',
      inputSchema: {
        type: 'object',
        properties: {
          job_name: { type: 'string' },
          build_number: { type: 'number' },
        },
        required: ['job_name', 'build_number'],
      },
    },
    {
      name: 'get_console_log',
      description: '获取构建控制台日志',
      inputSchema: {
        type: 'object',
        properties: {
          job_name: { type: 'string' },
          build_number: { type: 'number' },
          start: { type: 'number', description: '起始字节偏移' },
        },
        required: ['job_name', 'build_number'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'trigger_build': {
        const jobPath = args!.parameters
          ? `/job/${args!.job_name}/buildWithParameters?${new URLSearchParams(args!.parameters as Record<string, string>)}`
          : `/job/${args!.job_name}/build`
        const res = await fetch(`${JENKINS_URL}${jobPath}`, {
          method: 'POST',
          headers: authHeaders(),
        })
        const queueUrl = res.headers.get('Location')
        return {
          content: [{ type: 'text', text: JSON.stringify({ triggered: true, queue_url: queueUrl }) }],
        }
      }
      case 'get_build_status': {
        const data = await jenkinsFetch(`/job/${args!.job_name}/${args!.build_number}/api/json`)
        return {
          content: [{ type: 'text', text: JSON.stringify({ result: data.result, building: data.building, duration: data.duration, url: data.url }) }],
        }
      }
      case 'get_build_report': {
        const data = await jenkinsFetch(`/job/${args!.job_name}/${args!.build_number}/testReport/api/json`)
        return {
          content: [{ type: 'text', text: JSON.stringify(data) }],
        }
      }
      case 'get_console_log': {
        const startByte = (args!.start as number) || 0
        const res = await fetch(
          `${JENKINS_URL}/job/${args!.job_name}/${args!.build_number}/logText/progressiveText?start=${startByte}`,
          { headers: authHeaders() },
        )
        const text = await res.text()
        const moreData = res.headers.get('X-More-Data') === 'true'
        const newSize = res.headers.get('X-Text-Size')
        return {
          content: [{ type: 'text', text: JSON.stringify({ text, more_data: moreData, next_offset: newSize }) }],
        }
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
```

- [ ] **Step 5: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add components/mcps/jenkins-mcp/
git commit -m "feat: add jenkins-mcp component with trigger/status/report tools"
```

---

### Task 6: MCP — defect-mcp / knowledge-mcp / vcs-mcp

**Files:**
- Create: 3 个 MCP 目录，各含 manifest.json + package.json + tsconfig.json + src/index.ts

- [ ] **Step 1: 写 defect-mcp**

`components/mcps/defect-mcp/manifest.json`:

```json
{
  "id": "mcp-defect",
  "name": "defect-mcp",
  "type": "mcp",
  "version": "1.0.0",
  "description": "对接 Jira/Tapd，创建/更新缺陷单",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "system": {
        "type": "string",
        "title": "缺陷系统",
        "enum": ["jira", "tapd"],
        "default": "jira"
      },
      "url": { "type": "string", "title": "服务地址" },
      "token": { "type": "string", "title": "API Token" },
      "project_key": { "type": "string", "title": "项目 Key" }
    },
    "required": ["system", "url", "token", "project_key"]
  },
  "dependencies": [],
  "transport": "stdio"
}
```

`components/mcps/defect-mcp/package.json`:

```json
{
  "name": "defect-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "build": "tsc", "start": "node dist/index.js" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.0.0" },
  "devDependencies": { "typescript": "^5.0.0", "@types/node": "^20.0.0" }
}
```

`components/mcps/defect-mcp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`components/mcps/defect-mcp/src/index.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const DEFECT_URL = process.env.DEFECT_URL || ''
const DEFECT_TOKEN = process.env.DEFECT_TOKEN || ''
const DEFECT_SYSTEM = process.env.DEFECT_SYSTEM || 'jira'
const PROJECT_KEY = process.env.DEFECT_PROJECT_KEY || ''

function headers(): Record<string, string> {
  if (DEFECT_SYSTEM === 'jira') {
    return { Authorization: `Bearer ${DEFECT_TOKEN}`, 'Content-Type': 'application/json' }
  }
  // Tapd
  return { Authorization: `Bearer ${DEFECT_TOKEN}`, 'Content-Type': 'application/json' }
}

async function defectFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${DEFECT_URL}${path}`, { ...opts, headers: { ...headers(), ...opts?.headers } })
  if (!res.ok) throw new Error(`Defect API error: ${res.status}`)
  return res.json()
}

const server = new Server(
  { name: 'defect-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_issue',
      description: '创建缺陷单',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '标题' },
          description: { type: 'string', description: '描述' },
          severity: { type: 'string', enum: ['blocker', 'critical', 'major', 'minor', 'trivial'] },
          type: { type: 'string', enum: ['bug', 'task', 'improvement'] },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'description', 'severity'],
      },
    },
    {
      name: 'update_issue',
      description: '更新缺陷单',
      inputSchema: {
        type: 'object',
        properties: {
          issue_key: { type: 'string' },
          status: { type: 'string' },
          comment: { type: 'string' },
        },
        required: ['issue_key'],
      },
    },
    {
      name: 'search_issues',
      description: '搜索缺陷',
      inputSchema: {
        type: 'object',
        properties: {
          jql: { type: 'string', description: 'JQL 或等效查询语句' },
          max_results: { type: 'number', default: 20 },
        },
        required: ['jql'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    switch (name) {
      case 'create_issue': {
        const body = DEFECT_SYSTEM === 'jira'
          ? { fields: { project: { key: PROJECT_KEY }, summary: args!.title, description: args!.description, issuetype: { name: args!.type || 'Bug' }, priority: { name: args!.severity }, labels: args!.labels || [] } }
          : { title: args!.title, description: args!.description, priority: args!.severity, category: args!.type || 'bug' }
        const data = await defectFetch('/rest/api/2/issue', { method: 'POST', body: JSON.stringify(body) })
        return { content: [{ type: 'text', text: JSON.stringify({ key: data.key || data.id, url: `${DEFECT_URL}/browse/${data.key || data.id}` }) }] }
      }
      case 'update_issue': {
        const body: any = {}
        if (args!.status) {
          if (DEFECT_SYSTEM === 'jira') body.transition = { id: args!.status }
          else body.status = args!.status
        }
        if (args!.comment) body.comment = args!.comment
        await defectFetch(`/rest/api/2/issue/${args!.issue_key}/transitions`, { method: 'POST', body: JSON.stringify(body) })
        return { content: [{ type: 'text', text: JSON.stringify({ updated: true }) }] }
      }
      case 'search_issues': {
        const data = await defectFetch(`/rest/api/2/search?jql=${encodeURIComponent(args!.jql)}&maxResults=${args!.max_results || 20}`)
        return { content: [{ type: 'text', text: JSON.stringify(data.issues?.map((i: any) => ({ key: i.key, summary: i.fields?.summary, status: i.fields?.status?.name })) || []) }] }
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
main().catch(console.error)
```

- [ ] **Step 2: 写 knowledge-mcp**

`components/mcps/knowledge-mcp/manifest.json`:

```json
{
  "id": "mcp-knowledge",
  "name": "knowledge-mcp",
  "type": "mcp",
  "version": "1.0.0",
  "description": "知识库 CRUD + 语义检索",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "vault_path": {
        "type": "string",
        "title": "知识库路径",
        "default": "/data/knowledge",
        "description": "Obsidian vault 格式的知识库目录"
      }
    }
  },
  "dependencies": [],
  "transport": "stdio"
}
```

`components/mcps/knowledge-mcp/package.json`:

```json
{
  "name": "knowledge-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "build": "tsc", "start": "node dist/index.js" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.0.0" },
  "devDependencies": { "typescript": "^5.0.0", "@types/node": "^20.0.0" }
}
```

`components/mcps/knowledge-mcp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`components/mcps/knowledge-mcp/src/index.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import fs from 'fs/promises'
import path from 'path'

const VAULT_PATH = process.env.KNOWLEDGE_VAULT_PATH || '/data/knowledge'

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function listKnowledge(type?: string) {
  await ensureDir(VAULT_PATH)
  const files = await fs.readdir(VAULT_PATH)
  const mdFiles = files.filter(f => f.endsWith('.md'))
  const items = []
  for (const file of mdFiles) {
    const content = await fs.readFile(path.join(VAULT_PATH, file), 'utf-8')
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (frontmatterMatch) {
      const fm: any = {}
      frontmatterMatch[1].split('\n').forEach(line => {
        const [key, ...rest] = line.split(':')
        if (key && rest.length) fm[key.trim()] = rest.join(':').trim()
      })
      if (type && fm.type !== type) continue
      items.push({
        id: file.replace('.md', ''),
        title: fm.title || file,
        type: fm.type || 'unknown',
        tags: fm.tags ? fm.tags.replace(/[\[\]]/g, '').split(',').map((s: string) => s.trim()) : [],
        created: fm.created || '',
        file,
      })
    }
  }
  return items
}

const server = new Server(
  { name: 'knowledge-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_note',
      description: '创建知识条目（Obsidian 格式）',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['pattern', 'lesson', 'defect_pattern', 'script_template'] },
          tags: { type: 'array', items: { type: 'string' } },
          content: { type: 'string', description: 'Markdown 正文（含四段：问题/根因/解法/适用场景）' },
          source_task: { type: 'string' },
        },
        required: ['title', 'type', 'content'],
      },
    },
    {
      name: 'read_note',
      description: '读取知识条目',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: '文件名（不含 .md）' } },
        required: ['id'],
      },
    },
    {
      name: 'search_notes',
      description: '全文搜索知识条目',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          type: { type: 'string', description: '按类型筛选' },
          max_results: { type: 'number', default: 10 },
        },
        required: ['query'],
      },
    },
    {
      name: 'update_note',
      description: '更新知识条目',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    switch (name) {
      case 'create_note': {
        await ensureDir(VAULT_PATH)
        const slug = args!.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9一-鿿-]/g, '')
        const filename = `${slug}.md`
        const frontmatter = [
          '---',
          `type: ${args!.type}`,
          `title: ${args!.title}`,
          `source_task: ${args!.source_task || ''}`,
          `tags: [${(args!.tags || []).join(', ')}]`,
          `created: ${new Date().toISOString().split('T')[0]}`,
          `distilled: 0`,
          '---',
          '',
          args!.content,
        ].join('\n')
        await fs.writeFile(path.join(VAULT_PATH, filename), frontmatter, 'utf-8')
        return { content: [{ type: 'text', text: JSON.stringify({ id: slug, file: filename }) }] }
      }
      case 'read_note': {
        const content = await fs.readFile(path.join(VAULT_PATH, `${args!.id}.md`), 'utf-8')
        return { content: [{ type: 'text', text: content }] }
      }
      case 'search_notes': {
        const items = await listKnowledge(args!.type as string)
        const query = (args!.query as string).toLowerCase()
        const results = []
        for (const item of items.slice(0, 50)) {
          const content = await fs.readFile(path.join(VAULT_PATH, item.file), 'utf-8')
          if (content.toLowerCase().includes(query)) {
            results.push({ id: item.id, title: item.title, type: item.type, tags: item.tags })
            if (results.length >= (args!.max_results as number || 10)) break
          }
        }
        return { content: [{ type: 'text', text: JSON.stringify(results) }] }
      }
      case 'update_note': {
        const filePath = path.join(VAULT_PATH, `${args!.id}.md`)
        let content = await fs.readFile(filePath, 'utf-8')
        if (args!.content) {
          // 保留 frontmatter，替换正文
          const fmMatch = content.match(/^(---\n[\s\S]*?\n---)\n/)
          content = fmMatch ? `${fmMatch[1]}\n${args!.content}` : args!.content as string
        }
        if (args!.tags) {
          content = content.replace(/tags: \[.*?\]/, `tags: [${(args!.tags as string[]).join(', ')}]`)
        }
        await fs.writeFile(filePath, content, 'utf-8')
        return { content: [{ type: 'text', text: JSON.stringify({ updated: true }) }] }
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
main().catch(console.error)
```

- [ ] **Step 3: 写 vcs-mcp**

`components/mcps/vcs-mcp/manifest.json`:

```json
{
  "id": "mcp-vcs",
  "name": "vcs-mcp",
  "type": "mcp",
  "version": "1.0.0",
  "description": "脚本版本管理，Git 操作",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "repo_path": {
        "type": "string",
        "title": "仓库路径",
        "description": "脚本仓库本地路径"
      },
      "default_branch": {
        "type": "string",
        "title": "默认分支",
        "default": "main"
      }
    }
  },
  "dependencies": [],
  "transport": "stdio"
}
```

`components/mcps/vcs-mcp/package.json`:

```json
{
  "name": "vcs-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "build": "tsc", "start": "node dist/index.js" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.0.0" },
  "devDependencies": { "typescript": "^5.0.0", "@types/node": "^20.0.0" }
}
```

`components/mcps/vcs-mcp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`components/mcps/vcs-mcp/src/index.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const REPO_PATH = process.env.VCS_REPO_PATH || process.cwd()

async function git(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: REPO_PATH })
  return stdout.trim()
}

const server = new Server(
  { name: 'vcs-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'status',
      description: '查看 Git 仓库状态',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'diff',
      description: '查看文件变更',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件路径（可选）' } },
      },
    },
    {
      name: 'commit_and_push',
      description: '提交并推送变更',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '提交信息' },
          files: { type: 'array', items: { type: 'string' }, description: '要提交的文件' },
          branch: { type: 'string', description: '目标分支' },
        },
        required: ['message'],
      },
    },
    {
      name: 'create_branch',
      description: '创建新分支',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          base: { type: 'string', description: '基于哪个分支' },
        },
        required: ['name'],
      },
    },
    {
      name: 'log',
      description: '查看提交历史',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', default: 10 },
          path: { type: 'string' },
        },
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    switch (name) {
      case 'status': {
        const output = await git('status', '--porcelain')
        return { content: [{ type: 'text', text: output || 'Clean working tree' }] }
      }
      case 'diff': {
        const diffArgs = args?.path ? ['diff', args.path as string] : ['diff']
        const output = await git(...diffArgs)
        return { content: [{ type: 'text', text: output || 'No changes' }] }
      }
      case 'commit_and_push': {
        if (args?.files?.length) {
          await git('add', ...(args.files as string[]))
        } else {
          await git('add', '-A')
        }
        await git('commit', '-m', args!.message as string)
        if (args?.branch) {
          await git('push', 'origin', args.branch as string)
        } else {
          await git('push')
        }
        return { content: [{ type: 'text', text: JSON.stringify({ committed: true, message: args!.message }) }] }
      }
      case 'create_branch': {
        const base = (args?.base as string) || 'HEAD'
        await git('checkout', '-b', args!.name as string, base)
        return { content: [{ type: 'text', text: JSON.stringify({ branch: args!.name, base }) }] }
      }
      case 'log': {
        const count = (args?.count as number) || 10
        const logArgs = args?.path
          ? ['log', `-${count}`, '--oneline', '--', args.path as string]
          : ['log', `-${count}`, '--oneline']
        const output = await git(...logArgs)
        return { content: [{ type: 'text', text: output }] }
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
main().catch(console.error)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add components/mcps/
git commit -m "feat: add 4 MCP components (jenkins, defect, knowledge, vcs)"
```

---

### Task 7: Rules — test-script-standard / defect-format / knowledge-schema

**Files:**
- Create: 3 个 rule 目录，各含 manifest.json + rule.md

- [ ] **Step 1: 写 test-script-standard**

`components/rules/test-script-standard/manifest.json`:

```json
{
  "id": "rule-test-script-standard",
  "name": "test-script-standard",
  "type": "rule",
  "version": "1.0.0",
  "description": "脚本必须符合团队规范（命名、结构、断言模式）",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "naming_convention": {
        "type": "string",
        "title": "命名规范",
        "enum": ["snake_case", "camelCase"],
        "default": "snake_case"
      },
      "require_docstring": {
        "type": "boolean",
        "title": "要求文档字符串",
        "default": true
      },
      "assertion_style": {
        "type": "string",
        "title": "断言风格",
        "enum": ["explicit_message", "minimal"],
        "default": "explicit_message"
      }
    }
  },
  "dependencies": []
}
```

`components/rules/test-script-standard/rule.md`:

```markdown
# 测试脚本规范

## 命名
- 测试文件名：`test_<模块名>.py` / `<模块名>.test.ts`
- 测试函数名：`test_<功能点>_<场景>_<预期结果>`
- 命名风格按配置（默认 snake_case）

## 结构
- 每个测试函数必须有文档字符串（如启用 require_docstring）
- 文档字符串标注对应的 TC-ID
- 遵循 Arrange-Act-Assert 模式

## 断言
- 禁止无信息断言（如 `assertTrue(result)` ）
- 必须包含断言消息（如启用 explicit_message）
- 示例：`assertEqual(actual, expected, f"登录应返回 200，实际返回 {actual}")`

## 禁止
- 不允许硬编码测试数据（提取为常量或 fixture）
- 不允许跳过断言
- 不允许 `pass` 占位
```

- [ ] **Step 2: 写 defect-format**

`components/rules/defect-format/manifest.json`:

```json
{
  "id": "rule-defect-format",
  "name": "defect-format",
  "type": "rule",
  "version": "1.0.0",
  "description": "缺陷提单必须包含：复现步骤、预期结果、实际结果、环境信息",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "require_screenshot": {
        "type": "boolean",
        "title": "要求截图",
        "default": false
      },
      "require_logs": {
        "type": "boolean",
        "title": "要求日志",
        "default": true
      }
    }
  },
  "dependencies": []
}
```

`components/rules/defect-format/rule.md`:

```markdown
# 缺陷提单格式规范

## 必须字段

每个缺陷单必须包含以下四个字段，缺一不可：

1. **复现步骤**：按步骤编号，每步一个操作，可执行
2. **预期结果**：正确行为的明确描述
3. **实际结果**：观察到的错误行为
4. **环境信息**：版本号、环境（dev/staging/prod）、浏览器/设备

## 格式模板

```
## 复现步骤
1. 打开登录页面
2. 输入用户名 xxx
3. 点击登录
4. ...

## 预期结果
登录成功，跳转到首页

## 实际结果
页面显示 500 错误

## 环境信息
- 版本: v2.3.1
- 环境: staging
- 浏览器: Chrome 118
```

## 禁止
- 不允许"见附件"替代复现步骤
- 不允许模糊描述（如"不好用"、"有问题"）
- 不允许缺少环境信息
```

- [ ] **Step 3: 写 knowledge-schema**

`components/rules/knowledge-schema/manifest.json`:

```json
{
  "id": "rule-knowledge-schema",
  "name": "knowledge-schema",
  "type": "rule",
  "version": "1.0.0",
  "description": "知识条目必须包含：问题、根因、解法、适用场景",
  "author": "AutoRuner4Test",
  "config_schema": {
    "type": "object",
    "properties": {
      "require_root_cause": {
        "type": "boolean",
        "title": "要求根因分析",
        "default": true
      }
    }
  },
  "dependencies": []
}
```

`components/rules/knowledge-schema/rule.md`:

```markdown
# 知识条目格式规范

## 必须四段

每条知识必须包含完整的四个段落：

1. **问题**：描述了什么问题或场景
2. **根因**：问题的根本原因分析
3. **解法**：如何解决或应对
4. **适用场景**：什么情况下可以复用此知识

## Frontmatter

每条知识必须有 frontmatter：

```yaml
---
type: pattern | lesson | defect_pattern | script_template
source_task: task-uuid
tags: [tag1, tag2]
created: YYYY-MM-DD
---
```

## 禁止
- 不允许只有解法没有问题（无法判断适用场景）
- 不允许根因为"未知"（如启用 require_root_cause）
- 不允许没有标签（至少 1 个）
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add components/rules/
git commit -m "feat: add 3 rule components (test-script-standard, defect-format, knowledge-schema)"
```

---

### Task 8: 组件注册脚本

**Files:**
- Create: `scripts/register-components.ts`

- [ ] **Step 1: 写批量注册脚本**

将所有组件注册到后端 Registry。

```typescript
/**
 * 批量注册组件到 Registry
 * 用法: bun run scripts/register-components.ts [api_url]
 */
import fs from 'fs'
import path from 'path'

const API_URL = process.argv[2] || 'http://localhost:3000/api'

interface Manifest {
  id: string
  name: string
  type: 'skill' | 'hook' | 'mcp' | 'rule'
  version: string
  description: string
  author: string
  config_schema: Record<string, any>
  dependencies: string[]
  source: string
}

const COMPONENTS_DIR = path.join(__dirname, '..', 'components')

async function registerComponent(type: string, name: string) {
  const manifestPath = path.join(COMPONENTS_DIR, type + 's', name, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    console.log(`  ⚠ 跳过 ${name}: manifest.json 不存在`)
    return
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const source = path.join(COMPONENTS_DIR, type + 's', name)

  try {
    const res = await fetch(`${API_URL}/components/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: manifest.name,
        type: manifest.type,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        config_schema: manifest.config_schema,
        dependencies: manifest.dependencies,
        source,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      console.log(`  ✅ ${name} v${manifest.version}`)
    } else {
      console.log(`  ❌ ${name}: ${data.error || res.statusText}`)
    }
  } catch (err: any) {
    console.log(`  ❌ ${name}: ${err.message}`)
  }
}

async function main() {
  console.log('注册组件到 Registry...')
  const types = ['skill', 'hook', 'mcp', 'rule']

  for (const type of types) {
    const dir = path.join(COMPONENTS_DIR, type + 's')
    if (!fs.existsSync(dir)) continue
    console.log(`\n[${type.toUpperCase()}]`)
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await registerComponent(type, entry.name)
      }
    }
  }
  console.log('\n完成！')
}

main()
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add scripts/register-components.ts
git commit -m "feat: add batch component registration script"
```

---

## 自检

**1. Spec 覆盖检查：**

| 设计文档要求 | 对应 Task |
|---|---|
| 7 个 Skill | Task 1-3 |
| 3 个 Hook | Task 4 |
| 4 个 MCP | Task 5-6 |
| 3 个 Rule | Task 7 |
| 组件热插拔 | Phase 1 Registry API + manifest.json 结构 |
| 批量注册 | Task 8 |

**2. Placeholder 扫描：** 无 TBD/TODO

**3. 类型一致性：** manifest.json 的 id 格式统一（`{type}-{name}`），dependencies 引用 id 格式一致。MCP server 工具名与 Skill instruction 中引用的工具名对应。

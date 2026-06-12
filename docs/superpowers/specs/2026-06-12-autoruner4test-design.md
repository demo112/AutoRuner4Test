# AutoRuner4Test 设计文档

> 日期：2026-06-12
> 状态：已审批

## 一、概述

AI 驱动的测试自动化全生命周期平台。Claude Code 在 Docker 中以 headless 模式运行，通过可热插拔的 Skill/Hook/MCP/Rule 组件，逐节点执行测试全流程：需求分析 → 用例生成 → 脚本转换 → 执行分析 → 提单处理。知识沉淀贯穿全程。

**目标用户**：QA 团队 + 外部客户（混合场景）

**核心原则**：
- 每个流程节点是独立任务，不搞大编排
- 人选择组件，AI 组装执行
- 关键节点人工确认，其余自动流转
- 组件热插拔，前端管理

## 二、整体架构

```
┌─────────────────────────────────────────────────────┐
│                    前端管理界面                        │
│  ┌───────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ 组件仓库   │  │ 任务管理    │  │ 运行状态监控    │  │
│  │ Registry  │  │ (创建/配置) │  │ Dashboard      │  │
│  └─────┬─────┘  └─────┬──────┘  └───────┬────────┘  │
└────────┼──────────────┼─────────────────┼───────────┘
         │              │                 │
         ▼              ▼                 ▼
┌─────────────────────────────────────────────────────┐
│                 Orchestrator API                      │
│                                                     │
│  Registry ──→ 组装 ──→ Claude Code 实例              │
│  (组件CRUD)   (按任务拼  (带着选定的 skill/mcp/       │
│               装配置)     hook/rule 启动)             │
│                                                     │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Redis  │  │  SQLite  │  │  Artifact Store   │   │
│  │ (队列)  │  │ (元数据) │  │  (产出物文件)     │   │
│  └─────────┘  └──────────┘  └──────────────────┘   │
└──────────────────────────┬──────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         Jenkins      知识库        缺陷系统
        (已有)     (Obsidian)    (Jira/Tapd)
```

### 组件职责

| 组件 | 职责 | 技术 |
|------|------|------|
| Claude Code (Headless) | AI 执行核心 | Claude CLI `--print` 模式 |
| Orchestrator API | 组件管理、任务调度、实例生命周期 | Bun + Hono |
| Redis | 任务队列、缓存 | BullMQ |
| SQLite | 组件/任务元数据 | better-sqlite3 |
| Artifact Store | 任务产出物 | 文件系统 |
| Knowledge Base | 知识存取 | Obsidian 格式 + 可选 ChromaDB |
| Web Frontend | 用户交互 | React + Vite + shadcn/ui + React Flow |

## 三、组件仓库（Registry）

### 组件模型

每个组件是独立的"零件"，存放在 Registry 中。

```typescript
interface Component {
  id: string
  name: string
  type: 'skill' | 'hook' | 'mcp' | 'rule'
  version: string
  description: string
  author: string
  config_schema: Record<string, any>  // JSON Schema，前端据此渲染配置表单
  dependencies: string[]              // 依赖的其他组件 id
  source: string                      // git repo / local path / registry URL
  installed: boolean
  enabled: boolean
}
```

### 热插拔规则

- 安装/卸载不需要重启服务，下次任务自动生效
- 运行中的任务不受组件变更影响（实例隔离）
- 组件变更只影响新创建的任务

### 组件清单（初期）

**Skill：**

| 名称 | 触发场景 | 做什么 |
|------|---------|--------|
| `requirement-analysis` | 用户提交需求文档 | 解析需求，识别功能点、边界条件、隐含约束 |
| `testcase-generator` | 结构化需求就绪 | 生成测试用例（等价类、边界值、正交法） |
| `script-converter` | 测试用例就绪 | 自然语言用例 → 自动化脚本（对接已有 git 项目） |
| `jenkins-trigger` | 脚本就绪 | 调用 Jenkins API 触发构建 |
| `report-analyzer` | Jenkins 执行完成 | 分析报告，识别失败根因，分类（环境/代码/用例） |
| `issue-triage` | 分析出确认问题 | 生成缺陷描述，判断是否提单 |
| `knowledge-capture` | 阶段完成 | 提炼可复用知识，写入知识库 |

**Hook：**

| 名称 | 事件 | 做什么 |
|------|------|--------|
| `task-state-hook` | 任务状态变更 | 更新 DB，WebSocket 通知前端 |
| `review-request-hook` | 到达确认节点 | 通知前端等待人工确认 |
| `knowledge-distill-hook` | 阶段产出写入 | 检查蒸馏条件，触发知识沉淀 |

**MCP：**

| 名称 | 提供的能力 |
|------|-----------|
| `jenkins-mcp` | 触发构建、查询状态、获取报告 |
| `defect-mcp` | 对接 Jira/Tapd，创建/更新缺陷 |
| `knowledge-mcp` | 知识库 CRUD + 语义检索 |
| `vcs-mcp` | 脚本版本管理，Git 操作 |

**Rule：**

| 名称 | 约束 |
|------|------|
| `test-script-standard` | 脚本必须符合团队规范（命名、结构、断言模式） |
| `defect-format` | 缺陷提单必须包含：复现步骤、预期结果、实际结果、环境信息 |
| `knowledge-schema` | 知识条目必须包含：问题、根因、解法、适用场景 |

## 四、任务模型

### 核心原则

- 每个任务 = 一个阶段节点，独立执行
- 任务之间通过产出物关联（上游产出 → 下游输入）
- 不做跨节点自动编排，人决定跑什么、何时跑

### 5 种任务类型

| 类型 | 输入 | 产出 | 确认点 |
|------|------|------|--------|
| 需求分析 | 需求文档 | 结构化需求 | ✋ 人确认 |
| 用例生成 | 结构化需求 | 测试用例集 | 自动 |
| 脚本转换 | 测试用例集 | 自动化脚本 | 自动 |
| 执行分析 | 脚本 / Jenkins Job | 分析报告 + 问题分类 | ✋ 人确认 |
| 提单处理 | 确认的问题 | 缺陷单 | ✋ 提单前确认 |

### 任务实体

```typescript
interface Task {
  id: string
  type: 'requirement-analysis' | 'testcase-generation' | 'script-conversion' | 'execution-analysis' | 'issue-triage'
  status: 'pending' | 'running' | 'review' | 'approved' | 'completed' | 'failed'
  components: Component[]        // 选中的组件
  config: Record<string, any>    // 组件配置
  input_artifact_id?: string     // 上游产出物引用
  output_artifact_id?: string    // 本任务产出物
  created_at: string
  updated_at: string
}
```

### 产出物传递

```
任务1(需求分析) 产出 → 存入 Artifact Store
                         ↓
任务2(用例生成) 读取 ← 用户选择"基于哪个需求分析结果"
```

用户创建任务时选择输入源（某个已完成任务的产出），不自动链式触发。

### 确认机制

- 到达确认点时，任务状态 → `review`
- WebSocket 通知前端，弹窗展示 AI 分析结果
- 人确认 → `approved` → 继续或完成
- 人驳回 → 可修改输入/参数后重试

## 五、前端设计

### 技术选型

| 层 | 技术 |
|----|------|
| 前端框架 | React + Vite |
| UI 组件 | shadcn/ui + Tailwind |
| 状态管理 | Zustand |
| 实时通信 | WebSocket |
| 画布/拖拽 | React Flow（可选，后期任务编排用） |

### 核心页面

**1. 组件市场（Component Registry）**
- 按 skill/hook/mcp/rule 分 tab 展示
- 每个组件：名称、描述、版本、状态（已安装/未安装）、配置入口
- 安装/卸载 → 热加载
- 点击组件 → 展开配置表单（由 `config_schema` 动态渲染）

**2. 任务管理**
- 创建任务：选类型 → 选输入(可选) → 选组件 → 配置参数 → 启动
- 任务列表：类型、状态、创建时间
- 点击任务 → 详情页（实时日志、阶段进度、产出物）

**3. 运行监控（Dashboard）**
- 任务状态总览
- 确认节点弹窗：展示 AI 结果，确认/驳回/修改
- 实时日志流

**4. 知识库**
- 树状/标签浏览
- 全文搜索 + 语义搜索（可选）
- Markdown 编辑器，Obsidian 兼容

### 关键交互流

```
用户提交需求 → 创建"需求分析"任务 → 选组件 → 启动
    → Dashboard 监控 → 到确认节点 → 弹窗确认
    → 产出结构化需求 → 创建"用例生成"任务 → 选输入为该需求 → 启动
    → ...逐步推进
```

## 六、Docker 部署

### 容器结构

```
docker-compose.yml
├── app (主服务，单容器)
│   ├── Claude Code CLI (headless)
│   ├── Orchestrator API (Bun + Hono)
│   ├── Web Frontend (静态资源)
│   ├── Redis (任务队列 + 缓存)
│   └── SQLite (组件/任务元数据)
├── knowledge (卷)
│   └── Obsidian vault 格式
└── (外部) Jenkins — 已有
```

### Claude Code 实例管理

每个任务启动时：
1. Orchestrator 根据任务配置，组装组件列表
2. 生成临时工作目录 + `.claude/` 目录结构（含选定组件）
3. 启动 Claude Code headless 实例：`claude --print -p "任务指令"`
4. 实例运行完毕，产出物写入 artifact store，上下文归档

**并发控制**：同一时间最多 N 个 Claude Code 实例（可配置），超出排队。

### 卷挂载

| 挂载点 | 用途 |
|--------|------|
| `/data/components` | 组件仓库源码 |
| `/data/artifacts` | 任务产出物 |
| `/data/knowledge` | Obsidian 知识库 |
| `/data/db` | SQLite 数据库 |

### 外部连接

- Jenkins：HTTP API（容器网络可达）
- Jira/Tapd：MCP HTTP 客户端
- Git：SSH key 挂载

## 七、知识库设计

### 存储形式

- 主存储：Obsidian 格式 Markdown 文件（人类可读可编辑）
- 检索：文件名 + 全文搜索（初期），可选加 ChromaDB 语义检索

### 知识条目结构

```markdown
---
type: pattern | lesson | defect_pattern | script_template
source_task: task-uuid
tags: [web, login, boundary]
created: 2026-06-12
---

## 问题
...

## 根因
...

## 解法
...

## 适用场景
...
```

### 知识沉淀触发

- 每个任务完成时，`knowledge-capture` skill 提炼知识
- `knowledge-distill-hook` 检查未蒸馏痕迹数量，达阈值提醒

## 八、API 设计概要

### 组件管理

```
GET    /api/components              # 列出所有组件
POST   /api/components/install      # 安装组件
DELETE /api/components/:id          # 卸载组件
PUT    /api/components/:id/config   # 更新组件配置
GET    /api/components/:id/schema   # 获取配置表单 schema
```

### 任务管理

```
GET    /api/tasks                   # 任务列表
POST   /api/tasks                   # 创建任务
GET    /api/tasks/:id               # 任务详情
POST   /api/tasks/:id/start         # 启动任务
POST   /api/tasks/:id/approve       # 确认（review → approved）
POST   /api/tasks/:id/reject        # 驳回
GET    /api/tasks/:id/logs          # 实时日志（WebSocket upgrade）
GET    /api/tasks/:id/artifact      # 获取产出物
```

### 知识库

```
GET    /api/knowledge               # 知识条目列表
GET    /api/knowledge/:id           # 知识详情
POST   /api/knowledge               # 创建知识条目
PUT    /api/knowledge/:id           # 更新
GET    /api/knowledge/search?q=     # 搜索
```

### WebSocket

```
ws://host/ws                        # 实时推送
  - task:status-changed             # 任务状态变更
  - task:review-requested           # 确认节点到达
  - task:log                        # 实时日志行
```

## 九、非功能性需求

| 维度 | 要求 |
|------|------|
| 并发 | 默认最多 3 个 Claude Code 实例并行 |
| 隔离 | 每个任务独立工作目录、独立上下文 |
| 可靠性 | 任务失败不丢数据，可重试 |
| 安全 | API 鉴权，Jenkins/Git 凭据加密存储 |
| 可观测 | 结构化日志，任务全生命周期可追溯 |

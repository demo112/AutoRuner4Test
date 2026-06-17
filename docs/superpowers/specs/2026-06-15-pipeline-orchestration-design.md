> ⚠️ **已过时** — 本文档的设计理念已被反思推翻（2026-06-16）。核心问题：把内部执行模型暴露给了使用者角色。详见 `docs/superpowers/specs/2026-06-16-workspace-orchestration-retrospect.md`。

# Workspace Orchestration 设计文档

> 日期：2026-06-15
> 项目：AutoRuner4Test
> 特性：workspace-orchestration
> 状态：已审批

## 1. 核心概念

将 pipeline DAG 流程引擎重新定义为 **AI 工作环境模型**，核心类比：

| 概念 | 类比 | 说明 |
|------|------|------|
| AIMarket | Docker Hub | 组件远程仓库 |
| SKILL/HOOK/MCP/RULE | Docker Image | 原子可拉取单元 |
| Workspace Template | Dockerfile | AI 的受控工作配置 |
| Workspace Session | Container | 环境的一次实例化 |

**Workspace Template** = 角色 + 工具箱 + 阶段序列 + 审核点 + 产出规范 + 约束规则

**Workspace Session** = 模板的一次实例化运行，AI 在预设框架内自主决策，审核点硬性暂停不可跳过。

## 2. 数据模型

### 2.1 workspace_templates 表

```sql
CREATE TABLE workspace_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  role TEXT NOT NULL,            -- AI 在此环境中的角色定义
  constraints TEXT NOT NULL,     -- JSON string[] - 硬性约束规则
  stages TEXT NOT NULL,          -- JSON Stage[] - 有序阶段列表
  toolbox TEXT NOT NULL,         -- JSON ComponentRef[] - 全局组件
  is_public INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**Stage 结构**：
```typescript
interface Stage {
  id: string;               // 阶段唯一标识
  name: string;             // 阶段名称
  description: string;      // 阶段描述
  toolbox: string[];        // 阶段特有组件 ID（叠加到全局工具箱）
  output_spec: string;      // 期望产出描述
  review_required: boolean; // 是否强制人工审核
}
```

**ComponentRef 结构**：
```typescript
interface ComponentRef {
  component_id: string;     // 组件 ID
  source?: string;          // "local" | "aimarket://<id>"
}
```

### 2.2 workspace_sessions 表

```sql
CREATE TABLE workspace_sessions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES workspace_templates(id),
  template_version INTEGER,
  status TEXT DEFAULT 'pending',  -- pending/running/paused/completed/failed/cancelled
  current_stage TEXT,
  input TEXT NOT NULL,            -- JSON 用户初始输入
  context TEXT DEFAULT '{}',      -- JSON 累积阶段产出
  stage_states TEXT DEFAULT '{}', -- JSON Record<string, StageState>
  created_by TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**StageState 结构**：
```typescript
interface StageState {
  status: 'pending' | 'running' | 'waiting_review' | 'completed' | 'failed';
  started_at: string;
  completed_at: string;
  output: any;                     // 阶段产出
  review_result?: 'approved' | 'rejected';
  review_comment?: string;
  error?: string;
}
```

### 2.3 旧表处理

完全替换 `pipeline_templates` 和 `pipeline_runs` 表，不做数据迁移。

## 3. 执行引擎

### 3.1 会话生命周期

```
pending → running → (阶段循环) → completed/failed/cancelled
```

阶段循环：
1. 选择下一个 pending 阶段
2. 组装 .claude/ 配置目录
3. 构造 prompt（含 input + 累积 context + output_spec）
4. 通过 BullMQ 派发 Claude CLI 子进程执行
5. 等待执行结果
6. review_required? → waiting_review → 人工审核 → approved/rejected
7. approved → 产出追加到 context，进入下一阶段
8. rejected → 同阶段重试（携带拒绝原因）
9. 所有阶段完成 → completed

### 3.2 .claude/ 配置组装

每个阶段执行时，动态组装 .claude/ 目录：

```
.claude/
├── CLAUDE.md          # 角色 + 约束 + 当前阶段 output_spec
├── skills/            # 全局工具箱 ∪ 阶段工具箱 中的 skills
├── hooks/             # 全局工具箱 ∪ 阶段工具箱 中的 hooks
├── mcp.json           # 全局工具箱 ∪ 阶段工具箱 中的 MCP servers
└── rules/             # 全局工具箱 ∪ 阶段工具箱 中的 rules
```

CLAUDE.md 内容结构：
```markdown
# Role
{role}

# Constraints
{constraints 逐条列出}

# Current Stage: {stage.name}
{stage.description}

## Output Spec
{stage.output_spec}
```

### 3.3 Prompt 构造

```
## Input
{session.input}

## Context (Previous Stage Outputs)
{逐阶段展示累积产出}

## Your Task
Execute stage "{stage.name}": {stage.description}
Produce output matching: {stage.output_spec}
```

### 3.4 审核机制

- AI 执行到 `review_required` 阶段结束时，状态设为 `waiting_review`，**不可跳过**
- 用户在 Web UI 查看产出，选择通过或拒绝
- 通过 → 产出追加到 context，进入下一阶段
- 拒绝 → 评论必填，同阶段以 `rejected + comment` 作为额外上下文重试

### 3.5 关键约束

- 单阶段执行：同一时刻只有一个阶段在运行
- 工具箱隔离：每个阶段的可用组件 = 全局 ∪ 阶段特有（叠加，非替换）
- Context 只追加：后续阶段可读所有前序产出，不可修改
- 审核硬门禁：review_required 阶段必须人工确认才能继续

### 3.6 执行实现

复用现有 `claude-instance.ts` 模式 — 派生 Claude CLI 子进程，通过 BullMQ 队列管理。不使用 API 直调。

## 4. API 设计

### 4.1 Workspace Template API

```
GET    /api/workspace-templates              # 列表（?public=true 筛选公开）
GET    /api/workspace-templates/:id          # 详情
POST   /api/workspace-templates              # 创建
PUT    /api/workspace-templates/:id          # 更新（version 自增）
DELETE /api/workspace-templates/:id          # 删除
```

### 4.2 Workspace Session API

```
GET    /api/workspace-sessions                # 列表
GET    /api/workspace-sessions/:id            # 详情
POST   /api/workspace-sessions                # 创建（模板 + 初始输入）
POST   /api/workspace-sessions/:id/start      # 启动
POST   /api/workspace-sessions/:id/review/:stageId  # 审核（approved/rejected）
POST   /api/workspace-sessions/:id/retry/:stageId   # 重试失败阶段
POST   /api/workspace-sessions/:id/cancel            # 取消
```

### 4.3 删除的旧 API

- `/api/pipeline-templates/*` → `/api/workspace-templates/*`
- `/api/pipeline-runs/*` → `/api/workspace-sessions/*`

### 4.4 WebSocket 事件

```
session:stage-changed   { sessionId, stageId, status }
session:review-needed   { sessionId, stageId, output }
session:completed       { sessionId }
session:failed          { sessionId, stageId, error }
```

## 5. 前端页面

### 5.1 工作环境模板管理

**路由**：`/workspace-templates`（替换 `/pipeline-templates`）

MVP 表单式定义，不做可视化 DAG 编辑器。

- **模板列表页**：卡片展示，name / role / 阶段数 / 公开状态
- **模板编辑页**：3 区表单
  1. 基础信息：name、description、role
  2. 全局工具箱：从已安装组件选择（type 筛选）
  3. 阶段列表：有序列表，每阶段可展开编辑（name、description、阶段工具箱、output_spec、review_required）
- **模板详情页**：只读展示 + 基于该模板的会话历史

### 5.2 工作会话监控

**路由**：`/workspace-sessions`（替换 `/pipeline-runs`）

- **会话列表页**：表格，列 = 模板名 / 状态 / 当前阶段 / 创建时间
- **会话详情页**：3 区布局
  1. 阶段进度条：横向步骤条，状态图标
  2. 上下文面板：按阶段折叠展示累积产出
  3. 审核面板（waiting_review 时激活）：产出展示 + 通过/拒绝按钮 + 评论输入

### 5.3 状态徽标

```
pending        → 灰色 "待执行"
running        → 蓝色脉冲 "执行中"
waiting_review → 橙色 "待审核"（通知提示）
completed      → 绿色 "已完成"
failed         → 红色 "失败"
cancelled      → 灰色 "已取消"
```

### 5.4 删除的旧页面

- `PipelineTemplates.tsx` → `WorkspaceTemplates.tsx`
- `PipelineRuns.tsx` → `WorkspaceSessions.tsx`

### 5.5 不做的事（YAGNI）

- 可视化 DAG 编辑器
- 模板版本 diff 对比
- 会话实时日志流
- AIMarket 浏览器（组件选择器仅列本地已安装组件）

## 6. 与现有系统的关系

- **完全替换** pipeline 模块（template-service、run-service、executor）
- **复用** claude-instance.ts 的 CLI 子进程模式
- **复用** BullMQ worker 的队列管理
- **复用** component-registry.ts 的组件安装/管理
- **保留** 所有 17 个本地组件不变
- **保留** 其他模块（task、component、settings、claude-instance）不动

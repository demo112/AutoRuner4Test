# Workspace Orchestration v2 设计规格

> 日期：2026-06-16
> 项目：AutoRuner4Test
> 特性：workspace-orchestration-v2
> 状态：待审批
> 前置文档：`2026-06-16-workspace-orchestration-retrospect.md`

## 1. 核心洞察

**根本问题**：当前设计把内部执行模型（stages、toolbox、role、constraints）暴露给了使用者，导致使用者被吓退、构建者被限制。

**正确模型**：构建者配置完整的 `.claude/` 工作环境（像写 Dockerfile），使用者只选任务类型并输入（像 `docker run`）。

## 2. 设计原则

1. **双角色隔离** — 构建者和使用者看到完全不同的界面，零概念泄露
2. **Stage 不是顶级概念** — 执行流程是 CLAUDE.md 的内容，不是数据模型的字段
3. **Review Gate 是唯一的结构化中断点** — 只有审核点需要从执行流程中提取为结构化数据，因为需要机器执行暂停/等待/继续
4. **执行段派生于 Gate** — 无 Gate 则一次完整运行，N 个 Gate 则 N+1 段
5. **`.claude/` 是镜像格式** — Template 描述的完整 `.claude/` 目录，就是运行时组装出来的目录

## 3. 数据模型

### 3.1 WorkspaceTemplate（构建者的产物 = 环境镜像规格）

```typescript
interface WorkspaceTemplate {
  id: string
  name: string                     // "需求分析环境"（面向使用者显示）
  description: string              // 面向使用者的简短描述
  category: string                 // 任务类型分类（需求分析/用例生成/缺陷分流/...）

  // === 完整的 .claude/ 目录规格 ===
  claudeMd: string                 // CLAUDE.md 的完整内容
  skills: ComponentRef[]           // .claude/skills/ 的内容
  hooks: HookConfig[]              // .claude/settings.json 的 hooks 部分
  mcpServers: McpConfig[]          // .claude/settings.json 的 mcpServers 部分
  rules: RuleRef[]                 // .claude/rules/ 或嵌入 CLAUDE.md 的规则

  // === 审核点（从执行流程中提取的结构化数据）===
  reviewGates: ReviewGate[]

  // === 使用者看到的元信息 ===
  inputSchema: object              // 使用者需要提供什么输入（JSON Schema）
  outputDescription: string        // 产出物描述（面向使用者）

  // 元数据
  is_public: boolean
  is_starter: boolean              // 是否为内置 starter 模板
  version: number
  created_by: string
  created_at: string
  updated_at: string | null
}
```

**字段说明**：

- `claudeMd`：完整的 CLAUDE.md 文本。包含角色定义、约束规则、执行流程指引。执行流程中用标记 `<!-- GATE:gate-id -->` 标注审核点位置（仅作人类可读标记，不参与引擎逻辑）
- `skills`：引用已安装的 skill 组件
- `hooks`：hook 配置，结构同 `.claude/settings.json` 的 hooks 格式
- `mcpServers`：MCP 服务器配置，结构同 `.claude/settings.json` 的 mcpServers 格式
- `rules`：规则文件引用
- `inputSchema`：JSON Schema 对象，定义使用者输入的结构。前端根据此 schema 动态渲染输入表单
- `outputDescription`：自然语言描述，告诉使用者会得到什么

### 3.2 ReviewGate（审核点）

```typescript
interface ReviewGate {
  id: string                       // "requirement-confirmation"
  name: string                     // "需求确认"
  description: string              // 面向使用者的说明："请确认需求分析结果是否准确"
}
```

审核点是引擎执行时的**逻辑断点**：
- 引擎运行到审核点时暂停会话
- 使用者在 UI 查看当前产出，选择通过或拒绝
- 通过 → 继续下一段执行
- 拒绝 → 携带拒绝原因重跑当前段

### 3.3 WorkspaceSession（使用者的会话）

```typescript
interface WorkspaceSession {
  id: string
  template_id: string
  template_version: number
  status: 'pending' | 'running' | 'waiting_review' | 'completed' | 'failed' | 'cancelled'
  input: Record<string, unknown>   // 使用者输入（符合 template.inputSchema）
  output: unknown                  // 最终产出
  currentGate: string | null       // 当前等待的审核点 ID
  reviewHistory: ReviewRecord[]    // 审核记录
  context: Record<string, unknown> // 累积的段产出（内部状态，不暴露给使用者）
  segmentStates: Record<string, SegmentState> // 段执行状态（内部状态）
  error: string | null
  created_by: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface ReviewRecord {
  gateId: string
  result: 'approved' | 'rejected'
  comment: string
  reviewed_at: string
}

interface SegmentState {
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at: string
  completed_at: string
  output: unknown
  error: string | null
}
```

### 3.4 辅助类型

```typescript
interface ComponentRef {
  component_id: string             // 已安装组件的 ID
}

interface HookConfig {
  event: string                    // hook 事件名（如 "PostToolUse"）
  matcher?: string                 // 可选匹配器
  command: string                  // 要执行的命令
}

interface McpConfig {
  name: string                     // MCP 服务器名称
  command: string                  // 启动命令
  args?: string[]                  // 命令参数
  env?: Record<string, string>     // 环境变量
}

interface RuleRef {
  component_id: string             // 引用已安装的 rule 组件
}
```

### 3.5 数据库表

```sql
-- 替换 workspace_templates 表（DROP + CREATE，不做数据迁移）
CREATE TABLE workspace_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',

  -- .claude/ 目录规格
  claude_md TEXT NOT NULL DEFAULT '',         -- CLAUDE.md 完整内容
  skills TEXT NOT NULL DEFAULT '[]',          -- JSON ComponentRef[]
  hooks TEXT NOT NULL DEFAULT '[]',           -- JSON HookConfig[]
  mcp_servers TEXT NOT NULL DEFAULT '[]',     -- JSON McpConfig[]
  rules TEXT NOT NULL DEFAULT '[]',           -- JSON RuleRef[]

  -- 审核点
  review_gates TEXT NOT NULL DEFAULT '[]',    -- JSON ReviewGate[]

  -- 使用者元信息
  input_schema TEXT NOT NULL DEFAULT '{}',    -- JSON Schema object
  output_description TEXT NOT NULL DEFAULT '',

  -- 元数据
  is_public INTEGER NOT NULL DEFAULT 0,
  is_starter INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 替换 workspace_sessions 表
CREATE TABLE workspace_sessions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES workspace_templates(id),
  template_version INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'waiting_review', 'completed', 'failed', 'cancelled')),
  current_gate TEXT,
  input TEXT NOT NULL,                        -- JSON
  output TEXT,                                -- JSON
  review_history TEXT NOT NULL DEFAULT '[]',  -- JSON ReviewRecord[]
  context TEXT NOT NULL DEFAULT '{}',         -- JSON
  segment_states TEXT NOT NULL DEFAULT '{}',  -- JSON Record<string, SegmentState>
  error TEXT,
  created_by TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## 4. 执行引擎

### 4.1 核心概念：Gate-driven Segmentation

模板定义了 N 个审核点。引擎据此将执行分为 N+1 段：

```
0 个 Gate → 1 段：[start → end]
1 个 Gate → 2 段：[start → gate_0] [gate_0 → end]
2 个 Gate → 3 段：[start → gate_0] [gate_0 → gate_1] [gate_1 → end]
```

每段是一次 Claude CLI 子进程调用。

### 4.2 段 Prompt 构造

每段的 prompt 包含：

```
## 你的任务
{template.claudeMd 中当前段的执行流程指引}

## 输入
{session.input（按 inputSchema 验证过的用户输入）}

## 前序产出
{context 中所有已完成的段产出}

## 审核反馈（仅当上段被拒绝后重跑时）
{reviewHistory 中最近一条拒绝记录}
```

CLAUDE.md 中的 `<!-- GATE:gate-id -->` 标记仅作人类可读标注，引擎不解析。引擎通过 `reviewGates` 数组的顺序来确定段边界。

### 4.3 会话生命周期

```
pending → running → (段循环) → completed / failed / cancelled
```

段循环：
1. 确定当前段索引（基于已完成的段数）
2. 组装 `.claude/` 目录
3. 构造段 prompt
4. 启动 Claude CLI 子进程
5. 等待完成
6. 当前段是 Gate 段？
   - 是 → `waiting_review` → 使用者审核 → approved 继续 / rejected 重跑当前段
   - 否 → 继续下一段
7. 所有段完成 → `completed`

### 4.4 `.claude/` 配置组装

```typescript
function assembleClaudeDir(workDir: string, template: WorkspaceTemplate): void {
  // .claude/CLAUDE.md — 直接写入 template.claudeMd
  // .claude/skills/ — 从已安装组件复制
  // .claude/settings.json — { hooks: template.hooks, mcpServers: template.mcpServers }
  // .claude/rules/ — 从已安装组件复制
}
```

关键变化：所有段共享同一个 `.claude/` 配置（因为段不再是独立概念，只是同一环境下的执行切片）。

### 4.5 审核机制

- 到达 Gate → 会话状态 `waiting_review`，WebSocket 通知前端
- 使用者在 UI 查看产出 → 通过或拒绝
- 通过 → 产出追加到 context，继续下一段
- 拒绝 → 评论必填，当前段以 `rejected + comment` 为额外上下文重跑
- 审核不可跳过（硬门禁）

### 4.6 与当前实现的对比

| 维度 | 当前（v1） | 重构后（v2） |
|------|-----------|-------------|
| 执行单元 | Stage（顶级概念，必须有） | Segment（派生于 Gate，可选） |
| 配置组装 | 每阶段重新组装，阶段有独立 toolbox | 一次组装，所有段共享 |
| CLAUDE.md | 引擎拼接 role+constraints+stage | 构建者写完整内容，引擎原样使用 |
| Prompt 构造 | 固定模板（Input/Context/Task） | 固定模板 + CLAUDE.md 中嵌入的流程指引 |
| 无审核模板 | 仍须按 stage 逐段执行 | 一次完整运行，无段分割 |
| 数据模型 | 6 个内部概念暴露给使用者 | 2 个使用者概念（任务类型+输入） |

## 5. API 设计

### 5.1 Workspace Template API

```
GET    /api/workspace-templates              # 列表（?category=需求分析 筛选分类，?starter=true 筛选 starter）
GET    /api/workspace-templates/:id          # 详情
POST   /api/workspace-templates              # 创建
PUT    /api/workspace-templates/:id          # 更新（version 自增）
POST   /api/workspace-templates/:id/clone    # 克隆（生成新模板，复制全部字段）
DELETE /api/workspace-templates/:id          # 删除
```

### 5.2 Workspace Session API

```
GET    /api/workspace-sessions                # 列表
GET    /api/workspace-sessions/:id            # 详情（使用者视角：不含 segmentStates）
POST   /api/workspace-sessions                # 创建（template_id + input）
POST   /api/workspace-sessions/:id/start      # 启动
POST   /api/workspace-sessions/:id/review/:gateId  # 审核（approved/rejected + comment）
POST   /api/workspace-sessions/:id/retry/:gateId   # 重试失败的 Gate 段
POST   /api/workspace-sessions/:id/cancel            # 取消
```

### 5.3 删除的旧 API

- 移除 `stageId` 相关路由参数（不再有 stage 概念）
- `/api/pipeline-templates/*` 和 `/api/pipeline-runs/*` 已在 v1 中替换，v2 无需额外清理

### 5.4 WebSocket 事件

```
session:gate-reached   { sessionId, gateId, gateName, output }
session:completed      { sessionId, output }
session:failed         { sessionId, error }
session:progress       { sessionId, segmentIndex, totalSegments }
```

### 5.5 构建者专用 API（内部接口，使用者不可见）

```
GET    /api/workspace-templates/:id/preview   # 预览 .claude/ 目录结构（不实际创建）
GET    /api/components?type=skill             # 列出已安装组件（构建者选择用）
```

## 6. 前端设计

### 6.1 双角色路由分离

```
/workspace-templates       → 构建者：模板管理
/workspace-templates/:id   → 构建者：模板编辑
/workspace-task-launch     → 使用者：选择任务 + 输入
/workspace-sessions        → 使用者：会话监控
/workspace-sessions/:id    → 使用者：会话详情 + 审核
```

### 6.2 构建者界面 — 模板编辑器

布局：左右分栏

**左侧：CLAUDE.md 编辑器**（核心区域，占 60%）
- Markdown 编辑器，实时预览
- 模板变量插入：`{{input.xxx}}` 引用使用者输入
- `<!-- GATE:gate-id -->` 标记可折叠高亮

**右侧：配置面板**（40%）
- 基础信息：name、description、category
- 组件选择器：从已安装组件选择 skill/hook/MCP/rule
- 审核点定义器：id、name、description（与 CLAUDE.md 中标记联动）
- 输入 Schema 定义器：JSON Schema 编辑器
- 产出描述
- 预览按钮：一键预览完整 `.claude/` 目录结构

### 6.3 使用者界面 — 任务启动

极简 3 步：

1. **选择任务类型**：卡片列表，每个卡片显示 name + description + outputDescription
2. **提供输入**：根据 `inputSchema` 动态渲染表单
3. **启动**：一键启动，跳转到会话详情

### 6.4 使用者界面 — 会话详情

- 状态徽标（pending/running/waiting_review/completed/failed）
- 进度指示：`段 2/3` — 不暴露段内容，只显示进度
- 当前产出预览（只读）
- 审核面板（仅 waiting_review 时出现）：产出展示 + 通过/拒绝 + 评论
- 最终产出查看/下载

### 6.5 状态徽标

```
pending        → 灰色 "待执行"
running        → 蓝色脉冲 "执行中"
waiting_review → 橙色 "待审核"
completed      → 绿色 "已完成"
failed         → 红色 "失败"
cancelled      → 灰色 "已取消"
```

## 7. 内置 Starter 模板

MVP 提供 3 个 starter 模板（`is_starter: true`）：

### 7.1 需求分析环境

```yaml
name: 需求分析
description: 分析需求文档，识别功能点、边界条件和隐含约束
category: 需求分析
claudeMd: |
  # Role
  你是一位资深的测试需求分析师。你的任务是分析需求文档，产出结构化的需求分析结果。

  # Constraints
  - 必须覆盖所有功能点，不可遗漏
  - 每个功能点必须标注优先级（P0/P1/P2）
  - 必须识别隐含约束和边界条件

  # 执行流程
  1. 阅读并理解需求文档
  2. 识别所有功能点
  3. 为每个功能点标注优先级
  4. 识别边界条件和隐含约束
  5. 产出结构化分析结果
  <!-- GATE:requirement-confirmation -->
  6. 根据审核反馈修订分析结果（如有）
skills: []
hooks: []
mcpServers: []
rules: []
reviewGates:
  - id: requirement-confirmation
    name: 需求确认
    description: 请确认需求分析结果是否准确完整
inputSchema:
  type: object
  properties:
    requirement_doc:
      type: string
      title: 需求文档
  required: [requirement_doc]
outputDescription: 结构化需求分析结果，包含功能点列表、优先级标注、边界条件和隐含约束
```

### 7.2 用例生成环境

```yaml
name: 用例生成
description: 基于结构化需求，生成完整的测试用例集
category: 用例生成
claudeMd: |
  # Role
  你是一位资深的测试工程师。你的任务是基于结构化需求，使用等价类划分、边界值分析等方法，生成完整的测试用例集。

  # Constraints
  - 每个功能点至少 3 条测试用例（正向/反向/边界）
  - 用例必须包含：前置条件、操作步骤、预期结果
  - 用例编号遵循 TC-{模块}-{序号} 格式

  # 执行流程
  1. 理解结构化需求
  2. 识别测试点
  3. 为每个测试点设计测试用例
  4. 产出测试用例集
reviewGates: []
inputSchema:
  type: object
  properties:
    structured_requirement:
      type: string
      title: 结构化需求
  required: [structured_requirement]
outputDescription: 完整的测试用例集，每条用例包含前置条件、操作步骤和预期结果
```

### 7.3 缺陷分流环境

```yaml
name: 缺陷分流
description: 分析缺陷描述，判断根因分类并生成缺陷报告
category: 缺陷分流
claudeMd: |
  # Role
  你是一位资深的缺陷分析师。你的任务是分析缺陷描述，识别根因并分类（环境问题/代码缺陷/用例问题），生成标准缺陷报告。

  # Constraints
  - 根因分类只能三选一：环境问题/代码缺陷/用例问题
  - 必须给出复现步骤
  - 必须评估影响范围

  # 执行流程
  1. 理解缺陷描述
  2. 分析可能根因
  3. 分类根因
  4. 生成标准缺陷报告
reviewGates: []
inputSchema:
  type: object
  properties:
    bug_description:
      type: string
      title: 缺陷描述
  required: [bug_description]
outputDescription: 标准缺陷报告，包含根因分类、复现步骤和影响范围评估
```

## 8. 迁移策略

### 8.1 数据库

- **DROP + CREATE** workspace_templates 和 workspace_sessions 表
- 不做数据迁移（开发阶段，无生产数据）
- 在 `db/client.ts` 的建表逻辑中替换

### 8.2 代码替换

| 当前文件 | 操作 |
|---------|------|
| `server/src/db/schema.ts` | 替换接口定义和建表 SQL |
| `server/src/services/workspace-executor.ts` | 重写：Gate-driven segmentation |
| `server/src/services/workspace-template-service.ts` | 重写：新字段 CRUD |
| `server/src/services/workspace-session-service.ts` | 重写：新状态机 |
| `server/src/routes/workspace-templates.ts` | 重写：新 API |
| `server/src/routes/workspace-sessions.ts` | 重写：新 API |
| `server/src/services/claude-instance.ts` | 修改：`.claude/` 组装逻辑适配新模板 |
| `web/src/pages/WorkspaceTemplates.tsx` | 重写：构建者编辑器 |
| `web/src/pages/WorkspaceSessions.tsx` | 重写：双角色分离 |
| `web/src/lib/store.ts` | 修改：适配新 API 响应 |
| `web/src/lib/api.ts` | 修改：新 API 路由 |

### 8.3 保留不动的模块

- component-registry（组件注册表，四类型模型不变）
- claude-instance 的 CLI 子进程模式不变
- BullMQ worker 不变
- 认证/用户模块不变
- 17 个本地组件不变

## 9. 不做的事（YAGNI）

- ❌ AIMarket 组件市场（仅使用本地已安装组件）
- ❌ 模板版本 diff 对比
- ❌ 会话实时日志流
- ❌ 可视化 DAG 编辑器
- ❌ 从现有项目 `.claude/` 目录导入模板
- ❌ 模板 marketplace
- ❌ 多人协作编辑模板
- ❌ CLAUDE.md 的 AI 辅助编写

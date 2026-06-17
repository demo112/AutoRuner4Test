# Workspace Orchestration 设计反思

> 日期：2026-06-16
> 项目：AutoRuner4Test
> 特性：workspace-orchestration
> 状态：反思 — 待重构

## 1. 起因

本地部署体验后，发现当前实现的根本设计问题：**把内部执行模型暴露给了使用者**。

使用者只想"帮我分析需求"，但界面要求他配置 role、constraints、stages、toolbox。
这等于让 Docker 用户写 Dockerfile，而不是 `docker run`。

## 2. 当前设计做对了什么

1. **Docker 类比方向正确** — Template = Dockerfile、Session = Container 的框架有价值
2. **执行引擎底层模型正确** — `workspace-executor.ts` 已在做 `.claude/` 目录组装（CLAUDE.md + skills + hooks + MCP + rules）
3. **组件注册表四类型模型正确** — skill/hook/mcp/rule 四种原子组件是构建 `.claude/` 环境的基本材料
4. **审核硬门禁正确** — review_required 不可跳过，安全约束合理
5. **串行执行 + 上下文只追加** — 简单且可预测

## 3. 根本错误

**一句话：把"内部执行模型"暴露给了"使用者"角色。**

| 层面 | Docker 世界 | 当前设计 | 问题 |
|------|------------|---------|------|
| 使用者看到的 | `docker run nginx` — 选镜像、给参数 | 选模板 → 配 role、constraints、stages、toolbox | 等于让用户写 Dockerfile |
| 构建者看到的 | 写 Dockerfile（FROM/RUN/EXPOSE） | 同一个表单，同一套字段 | 构建者缺少真正需要的能力 |
| 镜像内容 | 完整的文件系统层 | role + constraints + stages + toolbox | 不是完整的 `.claude/` 目录规格 |

连锁问题：
1. **使用者被吓退** — 只想"帮我分析需求"，不需要知道 stage、toolbox、role
2. **构建者被限制** — 想配置完整的 `.claude/` 工作环境，但表单只给了几个字段
3. **Docker 类比名存实亡** — Dockerfile 描述"一层一层构建完整文件系统"，当前 Template 只描述"角色 + 约束 + 阶段 + 工具引用"

## 4. 正确的理念模型

### 构建者视角（Builder）

配置一个 Claude 的完整工作环境，就像给新员工配电脑：

```
┌─ .claude/ ──────────────────────────────────────────────┐
│                                                         │
│  CLAUDE.md     → 角色、约束、工作流程指引                 │
│  skills/       → 装哪些技能？目录从哪来？                 │
│  hooks/        → 配什么钩子？触发时机？动作？             │
│  mcp.json      → 接什么 MCP 服务？参数？                  │
│  rules/        → 什么规则文件？内容？                     │
│                                                         │
│  执行流程 → 阶段只是 CLAUDE.md 的一部分，不是独立概念     │
└─────────────────────────────────────────────────────────┘
```

构建者的产出 = 完整的"环境镜像规格"。

### 使用者视角（User）

```
1. 选择任务类型：□ 需求分析  □ 用例生成  □ 缺陷分流
2. 提供输入：  [粘贴需求文档 / 选择测试目标 / 粘贴 bug 描述]
3. 等待执行：  ████████░░ 80% — 正在生成测试用例
4. 审核（如需要）：查看产出 → 通过 / 打回
5. 获取结果：  产出物下载/查看
```

使用者永远不需要知道：stage、toolbox、role、skill/hook/MCP、constraints。

### 关键洞察：阶段不是独立概念

**Stage 只是 CLAUDE.md 里的执行流程指引的一部分，不是数据模型的顶级概念。**

当前：`Template = role + constraints + stages[] + toolbox[]` — stages 是顶级概念
正确：`Template = 完整的 .claude/ 目录规格` — 执行流程是 CLAUDE.md 的内容

**审核点（Review Gate）必须从 CLAUDE.md 的文本描述中提取为结构化数据**，因为它需要被机器执行（暂停 → 通知 → 等待 → 继续），不能只是自然语言提示。

## 5. 数据模型重构方向

```typescript
// 构建者定义的环境镜像规格
interface WorkspaceTemplate {
  id: string;
  name: string;                    // "需求分析环境"
  description: string;             // 面向使用者的简短描述
  category: string;                // 任务类型分类

  // === 完整的 .claude/ 目录规格 ===
  claudeMd: string;                // CLAUDE.md 的完整内容
  skills: ComponentRef[];          // .claude/skills/ 的内容
  hooks: HookConfig[];             // .claude/settings.json 的 hooks
  mcpServers: McpConfig[];         // .claude/settings.json 的 mcpServers
  rules: RuleRef[];                // .claude/rules/ 或嵌入 CLAUDE.md

  // === 审核点（从执行流程中提取的结构化数据）===
  reviewGates: ReviewGate[];       // 机器可执行的暂停/等待点

  // === 使用者看到的元信息 ===
  inputSchema: object;             // 使用者需要提供什么输入（JSON Schema）
  outputDescription: string;       // 产出物描述（面向使用者）

  // 元数据
  is_public: boolean;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ReviewGate {
  id: string;
  name: string;                    // "需求确认"
  description: string;             // 面向使用者的说明
  trigger: string;                 // 触发条件
}

// 使用者的会话 — 不暴露内部结构
interface WorkspaceSession {
  id: string;
  template_id: string;
  status: 'pending' | 'running' | 'waiting_review' | 'completed' | 'failed' | 'cancelled';
  input: any;                      // 用户输入（符合 template.inputSchema）
  output: any;                     // 最终产出
  currentGate?: string;            // 当前等待的审核点
  reviewHistory: ReviewRecord[];   // 审核记录
  created_by: string;
  started_at: string;
  completed_at: string;
  created_at: string;
}
```

## 6. 前端重构方向

### 构建者界面（类似 Dockerfile IDE）

- CLAUDE.md 编辑器（核心区域）
- 组件选择器（从已安装组件选择 skill/hook/MCP/rule）
- 审核点定义器（在执行流程中标记需要人工确认的环节）
- 输入 Schema 定义器（定义使用者需要提供什么）
- 预览：一键预览完整的 `.claude/` 目录结构

### 使用者界面（极简）

- 任务类型选择器（卡片/列表）
- 输入表单（根据 inputSchema 动态渲染）
- 进度展示（不暴露 stage 级别细节）
- 审核面板（仅 waiting_review 时出现）
- 产出物查看/下载

## 7. 开放问题

1. **审核点的触发机制** — CLAUDE.md 里写了执行流程，引擎如何精确知道"执行到这一步该暂停"？从自然语言中提取信号 vs 约定标记？
2. **执行引擎的粒度** — 当前按 stage 粒度执行。如果 stages 不再是顶级概念，是一次完整运行还是仍然分步？
3. **构建者的技能门槛** — 写 CLAUDE.md + 配置完整 `.claude/` 的门槛比填表单高。是否需要模板市场和从现有项目导入的能力？

## 8. 结论

当前设计的根本问题是**抽象层级错位** — 把构建者的工作（配置环境）和使用者的工作（使用环境）混在了同一个界面里。

正确做法：构建者配置完整的 `.claude/` 工作环境（像写 Dockerfile），使用者只选择任务类型并输入（像 `docker run`）。

**Stage 不是数据模型的顶级概念，而是 CLAUDE.md 内容的一部分。只有 Review Gate 需要被提取为结构化数据供引擎执行。**

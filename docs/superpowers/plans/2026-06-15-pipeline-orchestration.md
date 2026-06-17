> ⚠️ **已过时** — 本文档的设计理念已被反思推翻（2026-06-16）。核心问题：把内部执行模型暴露给了使用者角色。详见 `docs/superpowers/specs/2026-06-16-workspace-orchestration-retrospect.md`。

# Workspace Orchestration 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Pipeline DAG 流程引擎替换为 Workspace 工作环境模型，实现模板定义（角色+工具箱+阶段+约束）和会话执行（串行阶段+审核门禁+上下文累积）。

**Architecture:** Workspace Template 定义 AI 的工作环境（Dockerfile 类比），Workspace Session 是一次实例化运行（Container 类比）。执行引擎复用 claude-instance.ts 的 Claude CLI 子进程模式，每个阶段动态组装 .claude/ 配置目录，串行执行。审核阶段硬性暂停，用户在 Web UI 通过/拒绝。

**Tech Stack:** Hono (HTTP), SQLite (better-sqlite3 via Bun), BullMQ (队列), Zustand (前端状态), React + TailwindCSS (UI), Claude CLI subprocess (执行)

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `server/src/db/schema.ts` | 替换 Pipeline 类型为 Workspace 类型，新增 Stage/StageState/ComponentRef 接口和建表 SQL |
| 修改 | `server/src/db/migrate.ts` | 替换 pipeline 表迁移为 workspace 表迁移 |
| 创建 | `server/src/services/workspace-template-service.ts` | 模板 CRUD + validateStages 校验 |
| 创建 | `server/src/services/workspace-session-service.ts` | 会话生命周期：create/start/review/retry/cancel |
| 创建 | `server/src/services/workspace-executor.ts` | 阶段执行引擎：prompt 构造 + .claude/ 配置组装 + Claude CLI 子进程派发 |
| 创建 | `server/src/routes/workspace-templates.ts` | 模板 HTTP 路由 |
| 创建 | `server/src/routes/workspace-sessions.ts` | 会话 HTTP 路由 |
| 修改 | `server/src/index.ts` | 替换路由注册 |
| 修改 | `server/src/ws/handler.ts` | 添加 session 相关广播事件 |
| 删除 | `server/src/services/pipeline-template-service.ts` | 旧模板服务 |
| 删除 | `server/src/services/pipeline-run-service.ts` | 旧运行服务 |
| 删除 | `server/src/services/pipeline-executor.ts` | 旧执行器 |
| 删除 | `server/src/routes/pipeline-templates.ts` | 旧模板路由 |
| 删除 | `server/src/routes/pipeline-runs.ts` | 旧运行路由 |
| 修改 | `web/src/lib/api.ts` | 替换 pipeline API 为 workspace API |
| 修改 | `web/src/lib/store.ts` | 替换 pipeline store 为 workspace store |
| 创建 | `web/src/pages/WorkspaceTemplates.tsx` | 工作环境模板管理页 |
| 创建 | `web/src/pages/WorkspaceSessions.tsx` | 工作会话监控页 |
| 删除 | `web/src/pages/PipelineTemplates.tsx` | 旧模板页 |
| 删除 | `web/src/pages/PipelineRuns.tsx` | 旧运行页 |
| 修改 | `web/src/App.tsx` | 替换路由 |
| 修改 | `web/src/components/Layout.tsx` | 替换导航项 |

---

### Task 1: 替换数据库 Schema

**Files:**
- 修改: `server/src/db/schema.ts`
- 修改: `server/src/db/migrate.ts`

- [ ] **Step 1: 替换 schema.ts 中的 Pipeline 类型定义为 Workspace 类型**

删除 `PipelineNode`, `PipelineEdge`, `PipelineTemplate`, `NodeState`, `PipelineRun` 接口和 `CREATE_PIPELINE_TEMPLATES_TABLE`, `CREATE_PIPELINE_RUNS_TABLE` SQL 常量。

替换为：

```typescript
// Workspace Orchestration 类型

export interface ComponentRef {
  component_id: string
  source?: string  // "local" | "aimarket://<id>"
}

export interface Stage {
  id: string
  name: string
  description: string
  toolbox: string[]        // 阶段特有组件 ID（叠加到全局工具箱）
  output_spec: string      // 期望产出描述
  review_required: boolean // 是否强制人工审核
}

export interface WorkspaceTemplate {
  id: string
  name: string
  description: string
  role: string               // AI 在此环境中的角色定义
  constraints: string[]      // 硬性约束规则
  stages: Stage[]            // 有序阶段列表
  toolbox: ComponentRef[]    // 全局组件
  is_public: boolean
  version: number
  created_by: string
  created_at: string
  updated_at: string | null
}

export interface StageState {
  status: 'pending' | 'running' | 'waiting_review' | 'completed' | 'failed'
  started_at: string
  completed_at: string
  output: any
  review_result?: 'approved' | 'rejected'
  review_comment?: string
  error?: string
}

export interface WorkspaceSession {
  id: string
  template_id: string
  template_version: number
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  current_stage: string | null
  input: Record<string, unknown>      // 用户初始输入
  context: Record<string, unknown>    // 累积阶段产出
  stage_states: Record<string, StageState>
  created_by: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}
```

SQL 常量：

```typescript
export const CREATE_WORKSPACE_TEMPLATES_TABLE = `
CREATE TABLE IF NOT EXISTS workspace_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  role TEXT NOT NULL,
  constraints TEXT NOT NULL,     -- JSON string[]
  stages TEXT NOT NULL,          -- JSON Stage[]
  toolbox TEXT NOT NULL,         -- JSON ComponentRef[]
  is_public INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)
`

export const CREATE_WORKSPACE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS workspace_sessions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES workspace_templates(id),
  template_version INTEGER,
  status TEXT DEFAULT 'pending',
  current_stage TEXT,
  input TEXT NOT NULL,            -- JSON
  context TEXT DEFAULT '{}',      -- JSON
  stage_states TEXT DEFAULT '{}', -- JSON Record<string, StageState>
  created_by TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)
`
```

- [ ] **Step 2: 更新 migrate.ts**

将 `CREATE_PIPELINE_TEMPLATES_TABLE` 和 `CREATE_PIPELINE_RUNS_TABLE` 的导入替换为 `CREATE_WORKSPACE_TEMPLATES_TABLE` 和 `CREATE_WORKSPACE_SESSIONS_TABLE`，并更新 `migrate()` 函数中的 `db.exec()` 调用。

```typescript
import {
  CREATE_COMPONENTS_TABLE,
  CREATE_TASKS_TABLE,
  CREATE_ARTIFACTS_TABLE,
  CREATE_KNOWLEDGE_TABLE,
  CREATE_KNOWLEDGE_LINKS_TABLE,
  CREATE_USERS_TABLE,
  CREATE_CREDENTIALS_TABLE,
  CREATE_WORKSPACE_TEMPLATES_TABLE,
  CREATE_WORKSPACE_SESSIONS_TABLE,
} from './schema'

export function migrate(): void {
  const db = getDb()
  db.exec(CREATE_COMPONENTS_TABLE)
  db.exec(CREATE_TASKS_TABLE)
  db.exec(CREATE_ARTIFACTS_TABLE)
  db.exec(CREATE_KNOWLEDGE_TABLE)
  db.exec(CREATE_KNOWLEDGE_LINKS_TABLE)
  db.exec(CREATE_USERS_TABLE)
  db.exec(CREATE_CREDENTIALS_TABLE)
  db.exec(CREATE_WORKSPACE_TEMPLATES_TABLE)
  db.exec(CREATE_WORKSPACE_SESSIONS_TABLE)
  log.info('Database migration complete')
}
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server && npx tsc --noEmit 2>&1 | head -30`
Expected: 可能有旧文件引用 Pipeline 类型的错误，Task 2-4 会修复

---

### Task 2: 创建 workspace-template-service.ts

**Files:**
- 创建: `server/src/services/workspace-template-service.ts`

- [ ] **Step 1: 创建模板服务**

```typescript
import { getDb } from '../db/client'
import type { WorkspaceTemplate, Stage, ComponentRef } from '../db/schema'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-template-service')

interface CreateTemplateInput {
  name: string
  description?: string
  role: string
  constraints: string[]
  stages: Stage[]
  toolbox: ComponentRef[]
  is_public?: boolean
  created_by: string
}

interface UpdateTemplateInput {
  name?: string
  description?: string
  role?: string
  constraints?: string[]
  stages?: Stage[]
  toolbox?: ComponentRef[]
  is_public?: boolean
}

function validateStages(stages: Stage[]): string | null {
  if (stages.length === 0) return '模板必须包含至少一个阶段'
  const ids = new Set<string>()
  for (const stage of stages) {
    if (!stage.id) return '阶段缺少 id'
    if (!stage.name) return `阶段 ${stage.id} 缺少 name`
    if (ids.has(stage.id)) return `阶段 id 重复: ${stage.id}`
    ids.add(stage.id)
  }
  return null
}

function rowToTemplate(row: Record<string, unknown>): WorkspaceTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || '',
    role: row.role as string,
    constraints: JSON.parse(row.constraints as string),
    stages: JSON.parse(row.stages as string),
    toolbox: JSON.parse(row.toolbox as string),
    is_public: Boolean(row.is_public),
    version: row.version as number,
    created_by: (row.created_by as string) || '',
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string) || null,
  }
}

export function listTemplates(filters?: { is_public?: boolean; created_by?: string }): WorkspaceTemplate[] {
  const db = getDb()
  let sql = 'SELECT * FROM workspace_templates WHERE 1=1'
  const params: unknown[] = []

  if (filters?.is_public !== undefined) {
    sql += ' AND is_public = ?'
    params.push(filters.is_public ? 1 : 0)
  }
  if (filters?.created_by) {
    sql += ' AND created_by = ?'
    params.push(filters.created_by)
  }
  sql += ' ORDER BY updated_at DESC, created_at DESC'

  const rows = db.prepare(sql).all(...params as string[]) as Record<string, unknown>[]
  return rows.map(rowToTemplate)
}

export function getTemplate(id: string): WorkspaceTemplate | undefined {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToTemplate(row) : undefined
}

export function createTemplate(input: CreateTemplateInput): WorkspaceTemplate | { error: string } {
  const validationError = validateStages(input.stages)
  if (validationError) return { error: validationError }

  const db = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO workspace_templates (id, name, description, role, constraints, stages, toolbox, is_public, created_by, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    input.name,
    input.description || '',
    input.role,
    JSON.stringify(input.constraints),
    JSON.stringify(input.stages),
    JSON.stringify(input.toolbox),
    input.is_public ? 1 : 0,
    input.created_by,
    now,
    now,
  )

  log.info('created workspace template', { id, name: input.name })
  return getTemplate(id)!
}

export function updateTemplate(id: string, input: UpdateTemplateInput, userId: string): WorkspaceTemplate | { error: string } {
  const existing = getTemplate(id)
  if (!existing) return { error: '模板不存在' }
  if (existing.created_by !== userId) return { error: '只能修改自己创建的模板' }

  const newStages = input.stages ?? existing.stages
  if (input.stages) {
    const validationError = validateStages(newStages)
    if (validationError) return { error: validationError }
  }

  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE workspace_templates
    SET name = ?, description = ?, role = ?, constraints = ?, stages = ?, toolbox = ?, is_public = ?, version = version + 1, updated_at = ?
    WHERE id = ?
  `).run(
    input.name ?? existing.name,
    input.description ?? existing.description,
    input.role ?? existing.role,
    JSON.stringify(input.constraints ?? existing.constraints),
    JSON.stringify(newStages),
    JSON.stringify(input.toolbox ?? existing.toolbox),
    (input.is_public ?? existing.is_public) ? 1 : 0,
    now,
    id,
  )

  log.info('updated workspace template', { id, version: existing.version + 1 })
  return getTemplate(id)!
}

export function deleteTemplate(id: string, userId: string): { success: boolean } | { error: string } {
  const existing = getTemplate(id)
  if (!existing) return { error: '模板不存在' }
  if (existing.created_by !== userId) return { error: '只能删除自己创建的模板' }

  const db = getDb()
  const sessions = db.prepare('SELECT id FROM workspace_sessions WHERE template_id = ? LIMIT 1').get(id)
  if (sessions) return { error: '模板存在关联的工作会话，无法删除' }

  db.prepare('DELETE FROM workspace_templates WHERE id = ?').run(id)
  log.info('deleted workspace template', { id })
  return { success: true }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server && npx tsc --noEmit 2>&1 | head -20`

---

### Task 3: 创建 workspace-executor.ts

**Files:**
- 创建: `server/src/services/workspace-executor.ts`

- [ ] **Step 1: 创建执行引擎**

核心逻辑：
- `buildStagePrompt()` — 构造阶段执行 prompt
- `assembleWorkspaceConfig()` — 组装 .claude/ 配置目录
- `executeStage()` — 通过 Claude CLI 子进程执行单个阶段
- `runSession()` — 驱动整个会话的阶段循环

```typescript
import { getDb } from '../db/client'
import type { WorkspaceTemplate, Stage, StageState, ComponentRef } from '../db/schema'
import { startClaudeInstance, getInstanceStatus, canStartInstance } from './claude-instance'
import { getTemplate } from './workspace-template-service'
import { listComponents } from './component-registry'
import { broadcast } from '../ws/handler'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-executor')

const MAX_OUTPUT_BYTES = Number(process.env.MAX_STAGE_OUTPUT_BYTES) || 1024 * 1024

// 构造阶段执行 prompt
function buildStagePrompt(
  sessionInput: Record<string, unknown>,
  context: Record<string, unknown>,
  stage: Stage,
  reviewComment?: string,
): string {
  let prompt = `## Input\n${JSON.stringify(sessionInput, null, 2)}\n\n`
  prompt += `## Context (Previous Stage Outputs)\n`

  for (const [key, value] of Object.entries(context)) {
    if (key === 'initial_input') continue
    prompt += `### ${key}\n${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n\n`
  }

  prompt += `## Your Task\n`
  prompt += `Execute stage "${stage.name}": ${stage.description}\n`
  prompt += `Produce output matching: ${stage.output_spec}\n`

  if (reviewComment) {
    prompt += `\n## Review Feedback\nYour previous output was rejected. Address this feedback:\n${reviewComment}\n`
  }

  return prompt
}

// 解析组件引用，获取组件信息
function resolveComponents(
  globalToolbox: ComponentRef[],
  stageToolbox: string[],
): Array<{ type: string; name: string; source: string }> {
  const allComponents = listComponents(undefined, true)
  const componentMap = new Map(allComponents.map(c => [c.id, c]))

  const componentIds = new Set<string>()
  for (const ref of globalToolbox) componentIds.add(ref.component_id)
  for (const id of stageToolbox) componentIds.add(id)

  const result: Array<{ type: string; name: string; source: string }> = []
  for (const id of componentIds) {
    const comp = componentMap.get(id)
    if (comp && comp.enabled) {
      result.push({ type: comp.type, name: comp.name, source: comp.source })
    }
  }
  return result
}

// 轮询等待 Claude CLI 实例完成
function waitForInstance(instanceId: string, timeoutMs = 600_000): Promise<{ stdout: string; stderr: string; status: string }> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const interval = setInterval(() => {
      const instance = getInstanceStatus(instanceId)
      if (!instance) {
        clearInterval(interval)
        reject(new Error(`Instance ${instanceId} not found`))
        return
      }
      if (instance.status === 'completed' || instance.status === 'failed') {
        clearInterval(interval)
        resolve({ stdout: instance.stdout, stderr: instance.stderr, status: instance.status })
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval)
        reject(new Error(`Instance ${instanceId} timed out`))
      }
    }, 2000)
  })
}

// 执行单个阶段
async function executeStage(
  sessionId: string,
  template: WorkspaceTemplate,
  stage: Stage,
  sessionInput: Record<string, unknown>,
  context: Record<string, unknown>,
  reviewComment?: string,
): Promise<{ output: any; error?: string }> {
  // 等待实例槽位
  while (!canStartInstance()) {
    await new Promise(r => setTimeout(r, 5000))
  }

  const components = resolveComponents(template.toolbox, stage.toolbox)
  const config: Record<string, any> = {}

  // 为 CLAUDE.md 注入角色和约束
  const claudeMdContent = [
    `# Role\n${template.role}\n`,
    `# Constraints\n${template.constraints.map(c => `- ${c}`).join('\n')}\n`,
    `# Current Stage: ${stage.name}\n${stage.description}\n`,
    `## Output Spec\n${stage.output_spec}\n`,
  ].join('\n')

  config['_claude_md'] = claudeMdContent

  const prompt = buildStagePrompt(sessionInput, context, stage, reviewComment)

  const result = startClaudeInstance(
    `ws-${sessionId}-${stage.id}`,
    stage.id,
    components,
    config,
    prompt,
  )

  if (result.error) {
    return { output: null, error: result.error }
  }

  // 广播阶段开始
  broadcast('session:stage-changed', sessionId, { stageId: stage.id, status: 'running' })

  try {
    const instanceResult = await waitForInstance(result.instanceId)

    if (instanceResult.status === 'completed') {
      let output: any
      try {
        const parsed = JSON.parse(instanceResult.stdout)
        output = parsed.result || parsed
      } catch {
        output = instanceResult.stdout
      }
      return { output }
    } else {
      return { output: null, error: instanceResult.stderr || 'Execution failed' }
    }
  } catch (err) {
    return { output: null, error: (err as Error).message }
  }
}

// 驱动整个会话
export async function runSession(sessionId: string): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined
  if (!row) { log.info('session not found', { sessionId }); return }

  const currentStatus = row.status as string
  if (currentStatus !== 'pending' && currentStatus !== 'paused') {
    log.info('session not runnable', { sessionId, status: currentStatus })
    return
  }

  const template = getTemplate(row.template_id as string)
  if (!template) {
    db.prepare('UPDATE workspace_sessions SET status = ? WHERE id = ?').run('failed', sessionId)
    return
  }

  const sessionInput: Record<string, unknown> = JSON.parse((row.input as string) || '{}')
  const context: Record<string, unknown> = JSON.parse((row.context as string) || '{}')
  const stageStates: Record<string, StageState> = JSON.parse((row.stage_states as string) || '{}')

  // 初始化阶段状态
  for (const stage of template.stages) {
    if (!stageStates[stage.id]) {
      stageStates[stage.id] = {
        status: 'pending',
        started_at: '',
        completed_at: '',
        output: null,
      }
    }
  }

  // 更新会话状态
  db.prepare('UPDATE workspace_sessions SET status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?')
    .run('running', new Date().toISOString(), sessionId)

  // 串行执行阶段
  for (const stage of template.stages) {
    const state = stageStates[stage.id]

    // 跳过已完成的阶段（resume 场景）
    if (state.status === 'completed') continue

    // 遇到等待审核的阶段（resume 场景），暂停
    if (state.status === 'waiting_review') {
      db.prepare('UPDATE workspace_sessions SET status = ?, current_stage = ?, stage_states = ?, context = ? WHERE id = ?')
        .run('paused', stage.id, JSON.stringify(stageStates), JSON.stringify(context), sessionId)
      broadcast('session:stage-changed', sessionId, { stageId: stage.id, status: 'waiting_review' })
      broadcast('session:review-needed', sessionId, { stageId: stage.id, output: state.output })
      return
    }

    // 执行阶段
    state.status = 'running'
    state.started_at = new Date().toISOString()
    db.prepare('UPDATE workspace_sessions SET current_stage = ?, stage_states = ? WHERE id = ?')
      .run(stage.id, JSON.stringify(stageStates), sessionId)

    const reviewComment = state.review_result === 'rejected' ? state.review_comment : undefined
    const result = await executeStage(sessionId, template, stage, sessionInput, context, reviewComment)

    if (result.error) {
      state.status = 'failed'
      state.error = result.error
      state.completed_at = new Date().toISOString()
      db.prepare('UPDATE workspace_sessions SET status = ?, stage_states = ? WHERE id = ?')
        .run('failed', JSON.stringify(stageStates), sessionId)
      broadcast('session:failed', sessionId, { stageId: stage.id, error: result.error })
      broadcast('session:stage-changed', sessionId, { stageId: stage.id, status: 'failed' })
      return
    }

    state.output = result.output

    if (stage.review_required) {
      state.status = 'waiting_review'
      db.prepare('UPDATE workspace_sessions SET status = ?, current_stage = ?, stage_states = ?, context = ? WHERE id = ?')
        .run('paused', stage.id, JSON.stringify(stageStates), JSON.stringify(context), sessionId)
      broadcast('session:review-needed', sessionId, { stageId: stage.id, output: state.output })
      broadcast('session:stage-changed', sessionId, { stageId: stage.id, status: 'waiting_review' })
      return
    }

    // 自动通过：产出追加到 context
    state.status = 'completed'
    state.completed_at = new Date().toISOString()
    context[stage.id] = state.output
    broadcast('session:stage-changed', sessionId, { stageId: stage.id, status: 'completed' })
  }

  // 所有阶段完成
  db.prepare('UPDATE workspace_sessions SET status = ?, completed_at = ?, stage_states = ?, context = ? WHERE id = ?')
    .run('completed', new Date().toISOString(), JSON.stringify(stageStates), JSON.stringify(context), sessionId)
  broadcast('session:completed', sessionId, {})
  log.info('session completed', { sessionId })
}

// 审核阶段
export function reviewStage(
  sessionId: string,
  stageId: string,
  approved: boolean,
  comment?: string,
): { success: boolean } | { error: string } {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined
  if (!row) return { error: '会话不存在' }
  if (row.status !== 'paused') return { error: '会话不在暂停状态' }

  const stageStates: Record<string, StageState> = JSON.parse((row.stage_states as string) || '{}')
  const state = stageStates[stageId]
  if (!state) return { error: '阶段不存在' }
  if (state.status !== 'waiting_review') return { error: '阶段不在等待审核状态' }

  const context: Record<string, unknown> = JSON.parse((row.context as string) || '{}')

  if (approved) {
    state.status = 'completed'
    state.review_result = 'approved'
    state.review_comment = comment
    state.completed_at = new Date().toISOString()
    context[stageId] = state.output
  } else {
    state.review_result = 'rejected'
    state.review_comment = comment || '被拒绝'
    // rejected 时重置状态为 pending 以便重试
    state.status = 'pending'
    state.started_at = ''
    state.completed_at = ''
  }

  db.prepare('UPDATE workspace_sessions SET stage_states = ?, context = ? WHERE id = ?')
    .run(JSON.stringify(stageStates), JSON.stringify(context), sessionId)

  broadcast('session:stage-changed', sessionId, { stageId, status: state.status })
  return { success: true }
}

// 取消会话
export function cancelSession(sessionId: string): { success: boolean } | { error: string } {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined
  if (!row) return { error: '会话不存在' }
  const status = row.status as string
  if (status !== 'pending' && status !== 'running' && status !== 'paused') {
    return { error: `无法从 ${status} 状态取消` }
  }

  db.prepare('UPDATE workspace_sessions SET status = ?, completed_at = ? WHERE id = ?')
    .run('cancelled', new Date().toISOString(), sessionId)
  broadcast('session:stage-changed', sessionId, { status: 'cancelled' })
  return { success: true }
}

// 重试失败阶段
export function retryStage(sessionId: string, stageId: string): { success: boolean } | { error: string } {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined
  if (!row) return { error: '会话不存在' }
  const status = row.status as string
  if (status !== 'failed' && status !== 'paused') return { error: '只能重试失败或暂停的会话中的阶段' }

  const stageStates: Record<string, StageState> = JSON.parse((row.stage_states as string) || '{}')
  const state = stageStates[stageId]
  if (!state) return { error: '阶段不存在' }
  if (state.status !== 'failed') return { error: '只能重试失败的阶段' }

  stageStates[stageId] = {
    status: 'pending',
    started_at: '',
    completed_at: '',
    output: null,
  }

  db.prepare("UPDATE workspace_sessions SET stage_states = ?, status = 'pending' WHERE id = ?")
    .run(JSON.stringify(stageStates), sessionId)
  broadcast('session:stage-changed', sessionId, { stageId, status: 'pending' })
  return { success: true }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server && npx tsc --noEmit 2>&1 | head -20`

---

### Task 4: 创建 workspace-session-service.ts

**Files:**
- 创建: `server/src/services/workspace-session-service.ts`

- [ ] **Step 1: 创建会话服务**

```typescript
import { getDb } from '../db/client'
import type { WorkspaceSession, StageState } from '../db/schema'
import { getTemplate } from './workspace-template-service'
import { runSession, reviewStage, cancelSession, retryStage } from './workspace-executor'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-session-service')

function rowToSession(row: Record<string, unknown>): WorkspaceSession {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    template_version: row.template_version as number,
    status: row.status as WorkspaceSession['status'],
    current_stage: (row.current_stage as string) || null,
    input: JSON.parse((row.input as string) || '{}'),
    context: JSON.parse((row.context as string) || '{}'),
    stage_states: JSON.parse((row.stage_states as string) || '{}'),
    created_by: (row.created_by as string) || '',
    started_at: (row.started_at as string) || null,
    completed_at: (row.completed_at as string) || null,
    created_at: row.created_at as string,
  }
}

export function listSessions(): WorkspaceSession[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM workspace_sessions ORDER BY created_at DESC').all() as Record<string, unknown>[]
  return rows.map(rowToSession)
}

export function getSession(id: string): WorkspaceSession | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToSession(row)
}

export function createSession(data: {
  template_id: string
  input: Record<string, unknown>
  created_by: string
}): WorkspaceSession | { error: string } {
  const template = getTemplate(data.template_id)
  if (!template) return { error: '模板不存在' }

  const id = crypto.randomUUID()
  const db = getDb()

  const initialStageStates: Record<string, StageState> = {}
  for (const stage of template.stages) {
    initialStageStates[stage.id] = {
      status: 'pending',
      started_at: '',
      completed_at: '',
      output: null,
    }
  }

  db.prepare(
    `INSERT INTO workspace_sessions (id, template_id, template_version, status, current_stage, input, context, stage_states, created_by)
     VALUES (?, ?, ?, 'pending', NULL, ?, '{}', ?, ?)`
  ).run(
    id,
    data.template_id,
    template.version,
    JSON.stringify(data.input || {}),
    JSON.stringify(initialStageStates),
    data.created_by,
  )

  log.info('created workspace session', { id, templateId: data.template_id })
  return getSession(id)!
}

export async function startSession(id: string): Promise<WorkspaceSession | { error: string }> {
  const session = getSession(id)
  if (!session) return { error: '会话不存在' }
  if (session.status !== 'pending') return { error: '只能启动待执行的会话' }

  await runSession(id)
  return getSession(id)!
}

export function reviewSessionStage(
  id: string,
  stageId: string,
  approved: boolean,
  comment?: string,
): { success: boolean } | { error: string } {
  const result = reviewStage(id, stageId, approved, comment)
  if ('error' in result) return result

  // 审核通过或拒绝后，继续执行
  runSession(id).catch(err => log.error('resume after review failed', { error: (err as Error).message }))
  return { success: true }
}

export function cancelSessionRun(id: string): { success: boolean } | { error: string } {
  return cancelSession(id)
}

export function retrySessionStage(id: string, stageId: string): { success: boolean } | { error: string } {
  const result = retryStage(id, stageId)
  if ('error' in result) return result

  runSession(id).catch(err => log.error('retry execute failed', { error: (err as Error).message }))
  return { success: true }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server && npx tsc --noEmit 2>&1 | head -20`

---

### Task 5: 创建 HTTP 路由

**Files:**
- 创建: `server/src/routes/workspace-templates.ts`
- 创建: `server/src/routes/workspace-sessions.ts`

- [ ] **Step 1: 创建 workspace-templates 路由**

```typescript
import { Hono } from 'hono'
import { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate } from '../services/workspace-template-service'

export const workspaceTemplateRoutes = new Hono()

workspaceTemplateRoutes.get('/', (c) => {
  const isPublic = c.req.query('public')
  const filters: { is_public?: boolean; created_by?: string } = {}
  if (isPublic === 'true') filters.is_public = true
  const templates = listTemplates(filters)
  return c.json(templates)
})

workspaceTemplateRoutes.get('/:id', (c) => {
  const id = c.req.param('id')
  const template = getTemplate(id)
  if (!template) return c.json({ error: '模板不存在' }, 404)
  return c.json(template)
})

workspaceTemplateRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { name, description, role, constraints, stages, toolbox, is_public, created_by } = body

  if (!name || !created_by || !role) {
    return c.json({ error: 'name、role 和 created_by 为必填项' }, 400)
  }

  const result = createTemplate({
    name,
    description,
    role,
    constraints: constraints || [],
    stages: stages || [],
    toolbox: toolbox || [],
    is_public,
    created_by,
  })
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result, 201)
})

workspaceTemplateRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name, description, role, constraints, stages, toolbox, is_public, created_by } = body

  const result = updateTemplate(id, { name, description, role, constraints, stages, toolbox, is_public }, created_by || 'operator')
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

workspaceTemplateRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const result = deleteTemplate(id, body.created_by || 'operator')
  if ('error' in result) return c.json({ error: result.error }, 404)
  return c.json({ success: true })
})
```

- [ ] **Step 2: 创建 workspace-sessions 路由**

```typescript
import { Hono } from 'hono'
import { listSessions, getSession, createSession, startSession, reviewSessionStage, cancelSessionRun, retrySessionStage } from '../services/workspace-session-service'

export const workspaceSessionRoutes = new Hono()

workspaceSessionRoutes.get('/', (c) => {
  const sessions = listSessions()
  return c.json(sessions)
})

workspaceSessionRoutes.get('/:id', (c) => {
  const id = c.req.param('id')
  const session = getSession(id)
  if (!session) return c.json({ error: '会话不存在' }, 404)
  return c.json(session)
})

workspaceSessionRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { template_id, input, created_by } = body

  if (!template_id || !created_by) {
    return c.json({ error: 'template_id 和 created_by 为必填项' }, 400)
  }

  const result = createSession({ template_id, input: input || {}, created_by })
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result, 201)
})

workspaceSessionRoutes.post('/:id/start', async (c) => {
  const id = c.req.param('id')
  const result = await startSession(id)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

workspaceSessionRoutes.post('/:id/review/:stageId', async (c) => {
  const id = c.req.param('id')
  const stageId = c.req.param('stageId')
  const body = await c.req.json().catch(() => ({}))
  const approved = body.approved !== false
  const comment = body.comment as string | undefined

  const result = reviewSessionStage(id, stageId, approved, comment)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

workspaceSessionRoutes.post('/:id/cancel', (c) => {
  const id = c.req.param('id')
  const result = cancelSessionRun(id)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

workspaceSessionRoutes.post('/:id/retry/:stageId', (c) => {
  const id = c.req.param('id')
  const stageId = c.req.param('stageId')
  const result = retrySessionStage(id, stageId)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server && npx tsc --noEmit 2>&1 | head -20`

---

### Task 6: 更新 index.ts 路由注册 + 删除旧文件

**Files:**
- 修改: `server/src/index.ts`
- 删除: `server/src/routes/pipeline-templates.ts`
- 删除: `server/src/routes/pipeline-runs.ts`
- 删除: `server/src/services/pipeline-template-service.ts`
- 删除: `server/src/services/pipeline-run-service.ts`
- 删除: `server/src/services/pipeline-executor.ts`

- [ ] **Step 1: 更新 index.ts**

替换导入和路由注册：

```typescript
// 替换这两行：
// import { pipelineTemplateRoutes } from './routes/pipeline-templates'
// import { pipelineRunRoutes } from './routes/pipeline-runs'
import { workspaceTemplateRoutes } from './routes/workspace-templates'
import { workspaceSessionRoutes } from './routes/workspace-sessions'

// 替换这两行：
// app.route('/api/pipeline-templates', pipelineTemplateRoutes)
// app.route('/api/pipeline-runs', pipelineRunRoutes)
app.route('/api/workspace-templates', workspaceTemplateRoutes)
app.route('/api/workspace-sessions', workspaceSessionRoutes)
```

- [ ] **Step 2: 删除旧 pipeline 文件**

删除以下 5 个文件：
- `server/src/routes/pipeline-templates.ts`
- `server/src/routes/pipeline-runs.ts`
- `server/src/services/pipeline-template-service.ts`
- `server/src/services/pipeline-run-service.ts`
- `server/src/services/pipeline-executor.ts`

- [ ] **Step 3: 验证编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server && npx tsc --noEmit 2>&1 | head -30`
Expected: 0 errors (server 端完全切换到 workspace)

---

### Task 7: 更新前端 API 和 Store

**Files:**
- 修改: `web/src/lib/api.ts`
- 修改: `web/src/lib/store.ts`

- [ ] **Step 1: 替换 api.ts 中的 pipeline API 为 workspace API**

删除 `pipelineTemplates` 和 `pipelineRuns` 对象，替换为：

```typescript
  workspaceTemplates: {
    list: (isPublic?: boolean) =>
      request<any[]>(`/workspace-templates${isPublic ? '?public=true' : ''}`),
    get: (id: string) => request<any>(`/workspace-templates/${id}`),
    create: (data: any) => request<any>('/workspace-templates', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/workspace-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ success: boolean }>(`/workspace-templates/${id}`, { method: 'DELETE' }),
  },
  workspaceSessions: {
    list: () => request<any[]>('/workspace-sessions'),
    get: (id: string) => request<any>(`/workspace-sessions/${id}`),
    create: (data: any) => request<any>('/workspace-sessions', { method: 'POST', body: JSON.stringify(data) }),
    start: (id: string) => request<any>(`/workspace-sessions/${id}/start`, { method: 'POST' }),
    review: (id: string, stageId: string, approved: boolean, comment?: string) =>
      request<{ success: boolean }>(`/workspace-sessions/${id}/review/${stageId}`, { method: 'POST', body: JSON.stringify({ approved, comment }) }),
    cancel: (id: string) => request<{ success: boolean }>(`/workspace-sessions/${id}/cancel`, { method: 'POST' }),
    retry: (id: string, stageId: string) => request<{ success: boolean }>(`/workspace-sessions/${id}/retry/${stageId}`, { method: 'POST' }),
  },
```

- [ ] **Step 2: 替换 store.ts 中的 pipeline 状态为 workspace 状态**

删除 `pipelineTemplates`, `loadingPipelineTemplates`, `fetchPipelineTemplates`, `pipelineRuns`, `loadingPipelineRuns`, `fetchPipelineRuns`, `updatePipelineRun`。

替换为：

```typescript
  // Workspace Templates
  workspaceTemplates: any[]
  loadingWorkspaceTemplates: boolean
  fetchWorkspaceTemplates: (isPublic?: boolean) => Promise<void>

  // Workspace Sessions
  workspaceSessions: any[]
  loadingWorkspaceSessions: boolean
  fetchWorkspaceSessions: () => Promise<void>
  updateWorkspaceSession: (sessionId: string, patch: Partial<any>) => void
```

实现：

```typescript
  // Workspace Templates
  workspaceTemplates: [],
  loadingWorkspaceTemplates: false,
  fetchWorkspaceTemplates: async (isPublic?: boolean) => {
    set({ loadingWorkspaceTemplates: true })
    try {
      const templates = await api.workspaceTemplates.list(isPublic)
      set({ workspaceTemplates: Array.isArray(templates) ? templates : [] })
    } finally {
      set({ loadingWorkspaceTemplates: false })
    }
  },

  // Workspace Sessions
  workspaceSessions: [],
  loadingWorkspaceSessions: false,
  fetchWorkspaceSessions: async () => {
    set({ loadingWorkspaceSessions: true })
    try {
      const sessions = await api.workspaceSessions.list()
      set({ workspaceSessions: Array.isArray(sessions) ? sessions : [] })
    } finally {
      set({ loadingWorkspaceSessions: false })
    }
  },
  updateWorkspaceSession: (sessionId, patch) => {
    set((state) => ({
      workspaceSessions: state.workspaceSessions.map(s => s.id === sessionId ? { ...s, ...patch } : s),
    }))
  },
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/web && npx tsc --noEmit 2>&1 | head -30`
Expected: 可能有旧页面引用错误，Task 8-9 会修复

---

### Task 8: 创建 WorkspaceTemplates.tsx

**Files:**
- 创建: `web/src/pages/WorkspaceTemplates.tsx`

- [ ] **Step 1: 创建工作环境模板管理页**

3 区表单：基础信息（name/description/role）→ 全局工具箱（组件选择）→ 阶段列表（有序，可展开编辑）。

```tsx
import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'

export default function WorkspaceTemplates() {
  const { workspaceTemplates, loadingWorkspaceTemplates, fetchWorkspaceTemplates, components, fetchComponents } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkspaceTemplates()
    fetchComponents()
  }, [])

  if (loadingWorkspaceTemplates) return <div className="p-6">加载中...</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">工作环境模板</h2>
        <button
          onClick={() => { setEditingId(null); setShowForm(true) }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          新建模板
        </button>
      </div>

      <div className="space-y-3">
        {workspaceTemplates.map((t: any) => (
          <div key={t.id} className="border rounded-lg p-4 hover:shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{t.name}</h3>
                <p className="text-sm text-gray-500 mt-1">角色: {t.role}</p>
                <div className="flex gap-3 mt-2 text-xs text-gray-400">
                  <span>阶段: {t.stages?.length || 0}</span>
                  <span>工具: {t.toolbox?.length || 0}</span>
                  <span>v{t.version}</span>
                  <span>{t.is_public ? '公开' : '私有'}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingId(t.id); setShowForm(true) }}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                >
                  编辑
                </button>
                <button
                  onClick={async () => { if (confirm('确定删除？')) { await api.workspaceTemplates.delete(t.id); fetchWorkspaceTemplates() } }}
                  className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
        {workspaceTemplates.length === 0 && (
          <p className="text-gray-400 text-center py-8">暂无工作环境模板，点击上方按钮创建</p>
        )}
      </div>

      {showForm && (
        <TemplateForm
          templateId={editingId}
          onClose={() => { setShowForm(false); setEditingId(null) }}
          onSaved={() => { setShowForm(false); setEditingId(null); fetchWorkspaceTemplates() }}
        />
      )}
    </div>
  )
}

interface StageInput {
  id: string
  name: string
  description: string
  toolbox: string[]
  output_spec: string
  review_required: boolean
}

function TemplateForm({ templateId, onClose, onSaved }: { templateId: string | null; onClose: () => void; onSaved: () => void }) {
  const { components } = useStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [role, setRole] = useState('')
  const [constraints, setConstraints] = useState<string[]>([''])
  const [globalToolbox, setGlobalToolbox] = useState<string[]>([])
  const [stages, setStages] = useState<StageInput[]>([{ id: crypto.randomUUID().slice(0, 8), name: '', description: '', toolbox: [], output_spec: '', review_required: false }])
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedStage, setExpandedStage] = useState<number | null>(0)

  useEffect(() => {
    if (templateId) {
      api.workspaceTemplates.get(templateId).then((t: any) => {
        setName(t.name)
        setDescription(t.description || '')
        setRole(t.role || '')
        setConstraints(t.constraints?.length > 0 ? t.constraints : [''])
        setGlobalToolbox((t.toolbox || []).map((ref: any) => ref.component_id))
        setStages(t.stages?.length > 0 ? t.stages : [{ id: crypto.randomUUID().slice(0, 8), name: '', description: '', toolbox: [], output_spec: '', review_required: false }])
        setIsPublic(t.is_public || false)
      })
    }
  }, [templateId])

  const addStage = () => {
    setStages([...stages, { id: crypto.randomUUID().slice(0, 8), name: '', description: '', toolbox: [], output_spec: '', review_required: false }])
    setExpandedStage(stages.length)
  }

  const removeStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index))
  }

  const updateStage = (index: number, field: keyof StageInput, value: any) => {
    setStages(stages.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const handleSave = async () => {
    setError('')
    if (!name || !role) {
      setError('名称和角色为必填项')
      return
    }
    setSaving(true)
    try {
      const toolbox = globalToolbox.map(id => ({ component_id: id, source: 'local' }))
      const validStages = stages.filter(s => s.name.trim())
      const payload = {
        name,
        description,
        role,
        constraints: constraints.filter(c => c.trim()),
        stages: validStages,
        toolbox,
        is_public: isPublic,
        created_by: 'operator',
      }

      if (templateId) {
        await api.workspaceTemplates.update(templateId, payload)
      } else {
        await api.workspaceTemplates.create(payload)
      }
      onSaved()
    } catch (e: any) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const installedComponents = (components || []).filter((c: any) => c.installed)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[720px] max-h-[90vh] overflow-auto p-6">
        <h3 className="text-lg font-bold mb-4">{templateId ? '编辑模板' : '新建模板'}</h3>

        {/* 基础信息 */}
        <div className="space-y-3 mb-6">
          <h4 className="font-medium text-sm text-gray-500 border-b pb-1">基础信息</h4>
          <div>
            <label className="block text-sm font-medium mb-1">名称 *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm" placeholder="例：需求分析师" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">描述</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full border rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">角色定义 *</label>
            <textarea value={role} onChange={e => setRole(e.target.value)} rows={3} className="w-full border rounded px-3 py-1.5 text-sm" placeholder="描述 AI 在此工作环境中的角色..." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">约束规则</label>
            {constraints.map((c, i) => (
              <div key={i} className="flex gap-1 mb-1">
                <input value={c} onChange={e => { const next = [...constraints]; next[i] = e.target.value; setConstraints(next) }} className="flex-1 border rounded px-3 py-1 text-sm" placeholder="例：必须使用等价类划分法" />
                <button onClick={() => setConstraints(constraints.filter((_, j) => j !== i))} className="px-2 text-xs text-red-500">✕</button>
              </div>
            ))}
            <button onClick={() => setConstraints([...constraints, ''])} className="text-xs text-blue-600 mt-1">+ 添加约束</button>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
            <label className="text-sm">公开</label>
          </div>
        </div>

        {/* 全局工具箱 */}
        <div className="space-y-3 mb-6">
          <h4 className="font-medium text-sm text-gray-500 border-b pb-1">全局工具箱</h4>
          <div className="flex flex-wrap gap-2">
            {installedComponents.map((c: any) => (
              <label key={c.id} className={`px-2 py-1 text-xs rounded border cursor-pointer ${globalToolbox.includes(c.id) ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}>
                <input type="checkbox" className="mr-1" checked={globalToolbox.includes(c.id)} onChange={e => {
                  if (e.target.checked) setGlobalToolbox([...globalToolbox, c.id])
                  else setGlobalToolbox(globalToolbox.filter(id => id !== c.id))
                }} />
                {c.name} <span className="text-gray-400">({c.type})</span>
              </label>
            ))}
            {installedComponents.length === 0 && <p className="text-xs text-gray-400">暂无已安装组件</p>}
          </div>
        </div>

        {/* 阶段列表 */}
        <div className="space-y-3 mb-6">
          <h4 className="font-medium text-sm text-gray-500 border-b pb-1">阶段列表</h4>
          {stages.map((stage, index) => (
            <div key={index} className="border rounded">
              <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedStage(expandedStage === index ? null : index)}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-gray-100 px-1.5 rounded">{index + 1}</span>
                  <span className="text-sm font-medium">{stage.name || '未命名阶段'}</span>
                  {stage.review_required && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 rounded">需审核</span>}
                </div>
                <div className="flex items-center gap-1">
                  {stages.length > 1 && <button onClick={e => { e.stopPropagation(); removeStage(index) }} className="text-xs text-red-500">✕</button>}
                  <span className="text-xs text-gray-400">{expandedStage === index ? '▲' : '▼'}</span>
                </div>
              </div>
              {expandedStage === index && (
                <div className="px-3 pb-3 space-y-2 border-t">
                  <div>
                    <label className="block text-xs font-medium mb-0.5">阶段名称 *</label>
                    <input value={stage.name} onChange={e => updateStage(index, 'name', e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-0.5">描述</label>
                    <textarea value={stage.description} onChange={e => updateStage(index, 'description', e.target.value)} rows={2} className="w-full border rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-0.5">产出规范</label>
                    <textarea value={stage.output_spec} onChange={e => updateStage(index, 'output_spec', e.target.value)} rows={2} className="w-full border rounded px-2 py-1 text-sm" placeholder="描述期望产出..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-0.5">阶段工具箱</label>
                    <div className="flex flex-wrap gap-1.5">
                      {installedComponents.map((c: any) => (
                        <label key={c.id} className={`px-1.5 py-0.5 text-xs rounded border cursor-pointer ${stage.toolbox.includes(c.id) ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}>
                          <input type="checkbox" className="mr-0.5" checked={stage.toolbox.includes(c.id)} onChange={e => {
                            const newToolbox = e.target.checked ? [...stage.toolbox, c.id] : stage.toolbox.filter((id: string) => id !== c.id)
                            updateStage(index, 'toolbox', newToolbox)
                          }} />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={stage.review_required} onChange={e => updateStage(index, 'review_required', e.target.checked)} />
                    <label className="text-xs">需要人工审核</label>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={addStage} className="w-full py-2 text-sm text-blue-600 border border-dashed rounded hover:bg-blue-50">+ 添加阶段</button>
        </div>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">取消</button>
          <button onClick={handleSave} disabled={saving || !name || !role} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/web && npx tsc --noEmit 2>&1 | head -20`

---

### Task 9: 创建 WorkspaceSessions.tsx

**Files:**
- 创建: `web/src/pages/WorkspaceSessions.tsx`

- [ ] **Step 1: 创建工作会话监控页**

3 区布局：阶段进度条 → 上下文面板 → 审核面板。

```tsx
import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'

const SESSION_STATUS_LABELS: Record<string, string> = {
  pending: '待执行',
  running: '执行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '已失败',
  cancelled: '已取消',
}

const SESSION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const STAGE_STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  pending: { dot: 'bg-gray-300', label: '待执行' },
  running: { dot: 'bg-blue-400 animate-pulse', label: '执行中' },
  waiting_review: { dot: 'bg-orange-400', label: '待审核' },
  completed: { dot: 'bg-green-400', label: '已完成' },
  failed: { dot: 'bg-red-400', label: '失败' },
}

export default function WorkspaceSessions() {
  const { workspaceSessions, loadingWorkspaceSessions, fetchWorkspaceSessions, fetchWorkspaceTemplates, workspaceTemplates } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkspaceSessions()
    fetchWorkspaceTemplates()
  }, [])

  if (loadingWorkspaceSessions) return <div className="p-6">加载中...</div>

  const session = selectedId ? workspaceSessions.find((s: any) => s.id === selectedId) : null

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">工作会话</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          启动会话
        </button>
      </div>

      {session ? (
        <SessionDetail session={session} onBack={() => setSelectedId(null)} onRefresh={fetchWorkspaceSessions} />
      ) : (
        <div className="space-y-3">
          {workspaceSessions.map((s: any) => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className="border rounded-lg p-4 hover:shadow-sm cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{s.template_id?.slice(0, 8)}...</h3>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span>v{s.template_version}</span>
                    <span>{s.created_by}</span>
                    <span>{s.created_at?.slice(0, 19).replace('T', ' ')}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs ${SESSION_STATUS_COLORS[s.status] || 'bg-gray-100'}`}>
                  {SESSION_STATUS_LABELS[s.status] || s.status}
                </span>
              </div>
            </div>
          ))}
          {workspaceSessions.length === 0 && (
            <p className="text-gray-400 text-center py-8">暂无工作会话，点击上方按钮启动</p>
          )}
        </div>
      )}

      {showCreate && (
        <CreateSessionForm
          templates={workspaceTemplates}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchWorkspaceSessions() }}
        />
      )}
    </div>
  )
}

function SessionDetail({ session, onBack, onRefresh }: { session: any; onBack: () => void; onRefresh: () => void }) {
  const [reviewComment, setReviewComment] = useState('')
  const [contextExpanded, setContextExpanded] = useState<Record<string, boolean>>({})

  const handleReview = async (stageId: string, approved: boolean) => {
    await api.workspaceSessions.review(session.id, stageId, approved, reviewComment || undefined)
    setReviewComment('')
    onRefresh()
  }

  const handleCancel = async () => {
    if (confirm('确定取消？')) {
      await api.workspaceSessions.cancel(session.id)
      onRefresh()
    }
  }

  const handleRetry = async (stageId: string) => {
    await api.workspaceSessions.retry(session.id, stageId)
    onRefresh()
  }

  const stageStates = session.stage_states || {}
  const waitingReviewStage = Object.entries(stageStates).find(([, state]: [string, any]) => state.status === 'waiting_review')

  return (
    <div>
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-3">← 返回列表</button>

      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">会话详情</h3>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs ${SESSION_STATUS_COLORS[session.status]}`}>
            {SESSION_STATUS_LABELS[session.status] || session.status}
          </span>
          {(session.status === 'running' || session.status === 'paused') && (
            <button onClick={handleCancel} className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">取消</button>
          )}
        </div>
      </div>

      {/* 阶段进度条 */}
      <div className="mb-6">
        <h4 className="font-medium mb-2 text-sm">阶段进度</h4>
        <div className="flex items-center gap-1">
          {Object.entries(stageStates).map(([stageId, state]: [string, any], index: number) => {
            const style = STAGE_STATUS_STYLES[state.status] || { dot: 'bg-gray-300', label: state.status }
            return (
              <div key={stageId} className="flex items-center">
                <div className="flex flex-col items-center" title={`${stageId}: ${style.label}`}>
                  <div className={`w-6 h-6 rounded-full ${style.dot} flex items-center justify-center text-white text-xs`}>
                    {index + 1}
                  </div>
                  <span className="text-[10px] mt-0.5 max-w-[60px] truncate text-gray-500">{stageId}</span>
                </div>
                {index < Object.keys(stageStates).length - 1 && (
                  <div className={`w-6 h-0.5 ${state.status === 'completed' ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 上下文面板 */}
      <div className="mb-6">
        <h4 className="font-medium mb-2 text-sm">阶段产出</h4>
        <div className="space-y-2">
          {Object.entries(stageStates).map(([stageId, state]: [string, any]) => (
            state.output && (
              <div key={stageId} className="border rounded">
                <div
                  className="px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                  onClick={() => setContextExpanded({ ...contextExpanded, [stageId]: !contextExpanded[stageId] })}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${STAGE_STATUS_STYLES[state.status]?.dot || 'bg-gray-300'}`} />
                    <span className="text-sm font-medium">{stageId}</span>
                  </div>
                  <span className="text-xs text-gray-400">{contextExpanded[stageId] ? '▲' : '▼'}</span>
                </div>
                {contextExpanded[stageId] && (
                  <div className="px-3 pb-3 border-t">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap mt-2 max-h-40 overflow-auto">
                      {typeof state.output === 'string' ? state.output : JSON.stringify(state.output, null, 2)}
                    </pre>
                    {state.error && <p className="text-xs text-red-500 mt-1">错误: {state.error}</p>}
                    {state.review_result && <p className="text-xs text-gray-400 mt-1">审核: {state.review_result}{state.review_comment ? ` - ${state.review_comment}` : ''}</p>}
                  </div>
                )}
              </div>
            )
          ))}
        </div>
      </div>

      {/* 审核面板 */}
      {waitingReviewStage && (
        <div className="border-2 border-orange-200 rounded-lg p-4 bg-orange-50">
          <h4 className="font-medium mb-2 text-sm text-orange-800">待审核阶段: {waitingReviewStage[0]}</h4>
          <div className="mb-3">
            <pre className="text-xs text-gray-600 whitespace-pre-wrap max-h-40 overflow-auto bg-white rounded p-2">
              {typeof waitingReviewStage[1].output === 'string' ? waitingReviewStage[1].output : JSON.stringify(waitingReviewStage[1].output, null, 2)}
            </pre>
          </div>
          <div className="mb-3">
            <textarea
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              rows={2}
              className="w-full border rounded px-3 py-1.5 text-sm"
              placeholder="审核意见（拒绝时必填）"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleReview(waitingReviewStage[0], true)}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              通过
            </button>
            <button
              onClick={() => { if (reviewComment.trim()) handleReview(waitingReviewStage[0], false); }}
              disabled={!reviewComment.trim()}
              className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
            >
              拒绝
            </button>
          </div>
        </div>
      )}

      {/* 失败阶段重试 */}
      {Object.entries(stageStates).filter(([, state]: [string, any]) => state.status === 'failed').map(([stageId, state]: [string, any]) => (
        <div key={stageId} className="border border-red-200 rounded p-3 mt-2 bg-red-50">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-red-800">{stageId} 失败</span>
              {state.error && <p className="text-xs text-red-500 mt-1">{state.error}</p>}
            </div>
            <button onClick={() => handleRetry(stageId)} className="px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-100">重试</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function CreateSessionForm({ templates, onClose, onCreated }: { templates: any[]; onClose: () => void; onCreated: () => void }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const [inputJson, setInputJson] = useState('{}')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setError('')
    setSaving(true)
    try {
      const input = JSON.parse(inputJson)
      const session = await api.workspaceSessions.create({ template_id: templateId, input, created_by: 'operator' })
      if ((session as any).error) {
        setError((session as any).error)
      } else {
        await api.workspaceSessions.start((session as any).id)
        onCreated()
      }
    } catch (e: any) {
      setError(e.message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[480px] p-6">
        <h3 className="text-lg font-bold mb-4">启动工作会话</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">选择模板 *</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm">
              {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">初始输入 (JSON)</label>
            <textarea value={inputJson} onChange={e => setInputJson(e.target.value)} rows={4} className="w-full border rounded px-3 py-1.5 text-sm font-mono text-xs" />
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">取消</button>
          <button onClick={handleCreate} disabled={saving || !templateId} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? '启动中...' : '启动'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/web && npx tsc --noEmit 2>&1 | head -20`

---

### Task 10: 更新 App.tsx、Layout.tsx + 删除旧前端页面

**Files:**
- 修改: `web/src/App.tsx`
- 修改: `web/src/components/Layout.tsx`
- 删除: `web/src/pages/PipelineTemplates.tsx`
- 删除: `web/src/pages/PipelineRuns.tsx`

- [ ] **Step 1: 更新 App.tsx**

替换 Pipeline 导入和路由：

```tsx
import WorkspaceTemplates from './pages/WorkspaceTemplates'
import WorkspaceSessions from './pages/WorkspaceSessions'

// 替换路由：
<Route path="/workspace-templates" element={<WorkspaceTemplates />} />
<Route path="/workspace-sessions" element={<WorkspaceSessions />} />
```

- [ ] **Step 2: 更新 Layout.tsx 导航**

替换 navItems 中的流程相关项：

```tsx
import { Package, ListTodo, Monitor, BookOpen, Briefcase, PlayCircle } from 'lucide-react'

const navItems = [
  { to: '/components', label: '组件市场', icon: Package },
  { to: '/tasks', label: '任务管理', icon: ListTodo },
  { to: '/dashboard', label: '运行监控', icon: Monitor },
  { to: '/knowledge', label: '知识库', icon: BookOpen },
  { to: '/workspace-templates', label: '工作环境', icon: Briefcase },
  { to: '/workspace-sessions', label: '工作会话', icon: PlayCircle },
]
```

- [ ] **Step 3: 删除旧前端页面**

删除：
- `web/src/pages/PipelineTemplates.tsx`
- `web/src/pages/PipelineRuns.tsx`

- [ ] **Step 4: 验证前端编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/web && npx tsc --noEmit 2>&1 | head -30`
Expected: 0 errors

---

### Task 11: 更新 WS handler 广播事件

**Files:**
- 修改: `server/src/ws/handler.ts`

- [ ] **Step 1: 添加 session 事件广播支持**

当前 `broadcast()` 函数签名是 `(event, taskId, data)`。添加一个 `broadcastSession()` 函数用于 workspace session 事件，复用现有 `shouldNotify` 逻辑但以 sessionId 为 key：

```typescript
export function broadcastSession(event: string, sessionId: string, data: any): void {
  const message = JSON.stringify({ event, sessionId, data, timestamp: new Date().toISOString() })
  for (const client of clients.values()) {
    if (shouldNotify(client.ws, sessionId) && client.ws.readyState === 1) {
      client.ws.send(message)
    }
  }
}
```

- [ ] **Step 2: 更新 workspace-executor.ts 使用 broadcastSession**

将 workspace-executor.ts 中所有 `broadcast(...)` 调用替换为 `broadcastSession(...)`。导入也要更新。

---

### Task 12: 端到端验证

**Files:**
- 无新文件

- [ ] **Step 1: 验证后端编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: 验证前端编译**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/web && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 验证旧文件已清理**

确认以下文件不存在：
- `server/src/routes/pipeline-templates.ts`
- `server/src/routes/pipeline-runs.ts`
- `server/src/services/pipeline-template-service.ts`
- `server/src/services/pipeline-run-service.ts`
- `server/src/services/pipeline-executor.ts`
- `web/src/pages/PipelineTemplates.tsx`
- `web/src/pages/PipelineRuns.tsx`

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(workspace): replace pipeline DAG with workspace orchestration model

- Replace pipeline_templates/pipeline_runs with workspace_templates/workspace_sessions
- Workspace Template = role + toolbox + stages + constraints (Dockerfile analogy)
- Workspace Session = template instantiation with serial stage execution (Container analogy)
- Stage execution via Claude CLI subprocess (reuse claude-instance.ts pattern)
- Review gate: stages with review_required pause for human approval
- Context accumulation: each stage output appended, read-only for subsequent stages
- Frontend: form-based template editor, session monitor with stage progress + review panel"
```

---

## 自检清单

| 设计规格要求 | 对应任务 |
|----------|----------|
| Workspace Template CRUD + 版本自增 | Task 2, 5 |
| 有序阶段校验（无环，不需要 DAG） | Task 2 (validateStages) |
| Workspace Session CRUD + start/review/retry/cancel | Task 4, 5 |
| 串行阶段执行（单阶段运行） | Task 3 (runSession for loop) |
| Claude CLI 子进程执行（复用 claude-instance.ts） | Task 3 (executeStage) |
| .claude/ 配置组装（角色+约束+阶段产出规范） | Task 3 (config['_claude_md']) |
| Prompt 构造（input + context + output_spec） | Task 3 (buildStagePrompt) |
| 审核门禁（review_required 暂停等待） | Task 3 (reviewStage) |
| 拒绝重试（携带拒绝原因） | Task 3 (reviewComment) |
| Context 只追加（产出自动传递下游） | Task 3 (context[stageId] = output) |
| 工具箱叠加（全局 ∪ 阶段特有） | Task 3 (resolveComponents) |
| WebSocket 事件推送 | Task 3, 11 |
| 模板公开/私有 | Task 2 (is_public) |
| 完整持久化 | Task 1 (SQLite) |
| 前端模板管理页（3 区表单） | Task 8 |
| 前端会话监控页（进度条+上下文+审核） | Task 9 |
| 前端路由 + 导航 | Task 10 |
| API 客户端 + Store | Task 7 |
| 旧 pipeline 文件清理 | Task 6, 10 |

# Workspace Orchestration v2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 workspace orchestration 层，实现双角色隔离（构建者配置 .claude/ 环境，使用者选任务+输入），以 Gate-driven Segmentation 替代 Stage 模型。

**Architecture:** 模板描述完整 .claude/ 目录规格（CLAUDE.md + skills + hooks + mcpServers + rules），审核点（ReviewGate）从执行流程中提取为结构化数据驱动段分割。N 个 Gate → N+1 段，每段一次 Claude CLI 子进程。前端双角色路由分离：构建者编辑器和使用者极简界面。

**Tech Stack:** Hono (server), bun:sqlite, React + Zustand (frontend), BullMQ (job queue), Claude CLI subprocess

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `server/src/db/schema.ts` | 重写 | V2 类型定义 + DROP+CREATE SQL |
| `server/src/db/migrate.ts` | 修改 | 加入 DROP 旧表逻辑 |
| `server/src/ws/handler.ts` | 修改 | Gate-based 广播函数 |
| `server/src/services/workspace-template-service.ts` | 重写 | 新字段 CRUD + clone + preview |
| `server/src/services/workspace-session-service.ts` | 重写 | Gate-driven 状态机 |
| `server/src/services/claude-instance.ts` | 修改 | .claude/ 组装适配新模板 |
| `server/src/services/workspace-executor.ts` | 重写 | Gate-driven segmentation 引擎 |
| `server/src/routes/workspace-templates.ts` | 重写 | 新 API（含 clone/preview） |
| `server/src/routes/workspace-sessions.ts` | 重写 | gateId 替代 stageId |
| `server/src/services/starter-templates.ts` | 新建 | 3 个内置 starter 模板种子 |
| `web/src/lib/api.ts` | 修改 | 新 API 路由 + 参数 |
| `web/src/lib/store.ts` | 修改 | 适配新 API 响应 |
| `web/src/components/Layout.tsx` | 修改 | 双角色导航 |
| `web/src/App.tsx` | 修改 | 新路由 |
| `web/src/pages/WorkspaceTemplates.tsx` | 重写 | 构建者编辑器（左右分栏） |
| `web/src/pages/WorkspaceTaskLaunch.tsx` | 新建 | 使用者任务启动页 |
| `web/src/pages/WorkspaceSessions.tsx` | 重写 | 使用者会话详情+审核 |

---

### Task 1: 数据库 Schema — V2 类型与 SQL

**Files:**
- Modify: `server/src/db/schema.ts`

- [ ] **Step 1: 替换 V2 类型定义和 SQL**

将 `schema.ts` 中的旧类型（WorkspaceTemplate/Stage/StageState/ComponentRef）和旧 SQL 替换为 V2 版本。保留其他不变的表 SQL（CREATE_COMPONENTS_TABLE 等）和类型。

```typescript
// === V2 类型定义 ===

export interface WorkspaceTemplate {
  id: string
  name: string
  description: string
  category: string

  // .claude/ 目录规格
  claude_md: string
  skills: string              // JSON ComponentRef[]
  hooks: string               // JSON HookConfig[]
  mcp_servers: string         // JSON McpConfig[]
  rules: string               // JSON RuleRef[]

  // 审核点
  review_gates: string        // JSON ReviewGate[]

  // 使用者元信息
  input_schema: string        // JSON Schema object
  output_description: string

  // 元数据
  is_public: number
  is_starter: number
  version: number
  created_by: string | null
  created_at: string
  updated_at: string | null
}

export interface ReviewGate {
  id: string
  name: string
  description: string
}

export interface WorkspaceSession {
  id: string
  template_id: string
  template_version: number | null
  status: 'pending' | 'running' | 'waiting_review' | 'completed' | 'failed' | 'cancelled'
  current_gate: string | null
  input: string               // JSON
  output: string | null       // JSON
  review_history: string      // JSON ReviewRecord[]
  context: string             // JSON
  segment_states: string      // JSON Record<string, SegmentState>
  error: string | null
  created_by: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface ReviewRecord {
  gateId: string
  result: 'approved' | 'rejected'
  comment: string
  reviewed_at: string
}

export interface SegmentState {
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at: string
  completed_at: string
  output: unknown
  error: string | null
}

export interface ComponentRef {
  component_id: string
}

export interface HookConfig {
  event: string
  matcher?: string
  command: string
}

export interface McpConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface RuleRef {
  component_id: string
}

// === V2 SQL ===

export const DROP_V1_TABLES = `
DROP TABLE IF EXISTS workspace_sessions;
DROP TABLE IF EXISTS workspace_templates;
`

export const CREATE_WORKSPACE_TEMPLATES_TABLE = `
CREATE TABLE IF NOT EXISTS workspace_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',

  claude_md TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  hooks TEXT NOT NULL DEFAULT '[]',
  mcp_servers TEXT NOT NULL DEFAULT '[]',
  rules TEXT NOT NULL DEFAULT '[]',

  review_gates TEXT NOT NULL DEFAULT '[]',

  input_schema TEXT NOT NULL DEFAULT '{}',
  output_description TEXT NOT NULL DEFAULT '',

  is_public INTEGER NOT NULL DEFAULT 0,
  is_starter INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
`

export const CREATE_WORKSPACE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS workspace_sessions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES workspace_templates(id),
  template_version INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'waiting_review', 'completed', 'failed', 'cancelled')),
  current_gate TEXT,
  input TEXT NOT NULL,
  output TEXT,
  review_history TEXT NOT NULL DEFAULT '[]',
  context TEXT NOT NULL DEFAULT '{}',
  segment_states TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_by TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`
```

- [ ] **Step 2: 运行服务器验证建表**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test && bun run server/src/index.ts &`
等待 2 秒后：`curl -s http://localhost:3000/ | head -1`
Expected: `{"name":"autoruner4test","version":"0.1.0"}`

然后杀掉进程：`kill %1`

- [ ] **Step 3: Commit**

```bash
git add server/src/db/schema.ts
git commit -m "feat(ws-v2): replace v1 schema types and SQL with gate-driven v2 model"
```

---

### Task 2: 数据库迁移 — DROP + CREATE

**Files:**
- Modify: `server/src/db/migrate.ts`

- [ ] **Step 1: 更新 migrate.ts 加入 DROP 旧表逻辑**

```typescript
import { getDb } from './client'
import {
  CREATE_COMPONENTS_TABLE,
  CREATE_TASKS_TABLE,
  CREATE_ARTIFACTS_TABLE,
  CREATE_KNOWLEDGE_TABLE,
  CREATE_KNOWLEDGE_LINKS_TABLE,
  CREATE_USERS_TABLE,
  CREATE_CREDENTIALS_TABLE,
  DROP_V1_TABLES,
  CREATE_WORKSPACE_TEMPLATES_TABLE,
  CREATE_WORKSPACE_SESSIONS_TABLE,
} from './schema'
import { moduleLogger } from '../services/logger'

const log = moduleLogger('migrate')

export function migrate(): void {
  const db = getDb()

  // V1 → V2: DROP 旧 workspace 表再重建
  db.exec(DROP_V1_TABLES)

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

- [ ] **Step 2: 启动服务器验证无报错**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test && bun run server/src/index.ts &`
等待 2 秒后：`curl -s http://localhost:3000/`
Expected: `{"name":"autoruner4test","version":"0.1.0"}`

杀掉：`kill %1`

- [ ] **Step 3: Commit**

```bash
git add server/src/db/migrate.ts
git commit -m "feat(ws-v2): add DROP v1 tables before CREATE in migration"
```

---

### Task 3: WebSocket 广播函数 — Gate-based

**Files:**
- Modify: `server/src/ws/handler.ts`

- [ ] **Step 1: 替换广播函数**

将 v1 的 `broadcastStageChanged`/`broadcastReviewNeeded`/`broadcastSessionFailed` 替换为 v2 gate-based 版本。保留 `broadcastSessionCompleted`，增加 output 参数和 `broadcastSessionProgress`。

```typescript
export function broadcastGateReached(sessionId: string, gateId: string, gateName: string, output: unknown): void {
  broadcast({
    event: 'session:gate-reached',
    data: { sessionId, gateId, gateName, output },
  })
}

export function broadcastSessionCompleted(sessionId: string, output: unknown): void {
  broadcast({
    event: 'session:completed',
    data: { sessionId, output },
  })
}

export function broadcastSessionFailed(sessionId: string, error: string): void {
  broadcast({
    event: 'session:failed',
    data: { sessionId, error },
  })
}

export function broadcastSessionProgress(sessionId: string, segmentIndex: number, totalSegments: number): void {
  broadcast({
    event: 'session:progress',
    data: { sessionId, segmentIndex, totalSegments },
  })
}
```

删除旧的 `broadcastStageChanged` 和 `broadcastReviewNeeded` 函数。保留底层的 `broadcast()`、`addClient()`、`removeClient()`、`handleSubscription()` 不动。

- [ ] **Step 2: Commit**

```bash
git add server/src/ws/handler.ts
git commit -m "feat(ws-v2): replace stage-based broadcast with gate-based events"
```

---

### Task 4: Workspace Template Service — V2 CRUD

**Files:**
- Rewrite: `server/src/services/workspace-template-service.ts`

- [ ] **Step 1: 重写 template service**

```typescript
import { getDb } from '../db/client'
import type { WorkspaceTemplate, ReviewGate, ComponentRef, HookConfig, McpConfig, RuleRef } from '../db/schema'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-template-service')

export interface CreateTemplateInput {
  name: string
  description?: string
  category?: string
  claude_md?: string
  skills?: ComponentRef[]
  hooks?: HookConfig[]
  mcp_servers?: McpConfig[]
  rules?: RuleRef[]
  review_gates?: ReviewGate[]
  input_schema?: object
  output_description?: string
  is_public?: boolean
  is_starter?: boolean
  created_by?: string
}

export interface UpdateTemplateInput extends Partial<CreateTemplateInput> {}

function rowToTemplate(row: any): WorkspaceTemplate {
  return {
    ...row,
    skills: JSON.parse(row.skills || '[]'),
    hooks: JSON.parse(row.hooks || '[]'),
    mcp_servers: JSON.parse(row.mcp_servers || '[]'),
    rules: JSON.parse(row.rules || '[]'),
    review_gates: JSON.parse(row.review_gates || '[]'),
    input_schema: JSON.parse(row.input_schema || '{}'),
  } as WorkspaceTemplate
}

export function listTemplates(filters?: { category?: string; starter?: boolean }): WorkspaceTemplate[] {
  const db = getDb()
  let sql = 'SELECT * FROM workspace_templates WHERE 1=1'
  const params: any[] = []

  if (filters?.category) {
    sql += ' AND category = ?'
    params.push(filters.category)
  }
  if (filters?.starter !== undefined) {
    sql += ' AND is_starter = ?'
    params.push(filters.starter ? 1 : 0)
  }

  sql += ' ORDER BY created_at DESC'
  const rows = db.prepare(sql).all(...params) as any[]
  return rows.map(rowToTemplate)
}

export function getTemplate(id: string): WorkspaceTemplate | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_templates WHERE id = ?').get(id) as any
  if (!row) return null
  return rowToTemplate(row)
}

export function createTemplate(input: CreateTemplateInput): WorkspaceTemplate {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO workspace_templates (id, name, description, category, claude_md, skills, hooks, mcp_servers, rules, review_gates, input_schema, output_description, is_public, is_starter, version, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.description || '',
    input.category || '',
    input.claude_md || '',
    JSON.stringify(input.skills || []),
    JSON.stringify(input.hooks || []),
    JSON.stringify(input.mcp_servers || []),
    JSON.stringify(input.rules || []),
    JSON.stringify(input.review_gates || []),
    JSON.stringify(input.input_schema || {}),
    input.output_description || '',
    input.is_public ? 1 : 0,
    input.is_starter ? 1 : 0,
    1,
    input.created_by || null,
    now,
  )

  log.info('Template created', { id, name: input.name })
  return getTemplate(id)!
}

export function updateTemplate(id: string, input: UpdateTemplateInput): WorkspaceTemplate | null {
  const db = getDb()
  const existing = getTemplate(id)
  if (!existing) return null

  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?']
  const params: any[] = [now]

  if (input.name !== undefined) { sets.push('name = ?'); params.push(input.name) }
  if (input.description !== undefined) { sets.push('description = ?'); params.push(input.description) }
  if (input.category !== undefined) { sets.push('category = ?'); params.push(input.category) }
  if (input.claude_md !== undefined) { sets.push('claude_md = ?'); params.push(input.claude_md) }
  if (input.skills !== undefined) { sets.push('skills = ?'); params.push(JSON.stringify(input.skills)) }
  if (input.hooks !== undefined) { sets.push('hooks = ?'); params.push(JSON.stringify(input.hooks)) }
  if (input.mcp_servers !== undefined) { sets.push('mcp_servers = ?'); params.push(JSON.stringify(input.mcp_servers)) }
  if (input.rules !== undefined) { sets.push('rules = ?'); params.push(JSON.stringify(input.rules)) }
  if (input.review_gates !== undefined) { sets.push('review_gates = ?'); params.push(JSON.stringify(input.review_gates)) }
  if (input.input_schema !== undefined) { sets.push('input_schema = ?'); params.push(JSON.stringify(input.input_schema)) }
  if (input.output_description !== undefined) { sets.push('output_description = ?'); params.push(input.output_description) }
  if (input.is_public !== undefined) { sets.push('is_public = ?'); params.push(input.is_public ? 1 : 0) }
  if (input.is_starter !== undefined) { sets.push('is_starter = ?'); params.push(input.is_starter ? 1 : 0) }

  sets.push('version = version + 1')

  params.push(id)
  db.prepare(`UPDATE workspace_templates SET ${sets.join(', ')} WHERE id = ?`).run(...params)

  log.info('Template updated', { id, version: existing.version + 1 })
  return getTemplate(id)
}

export function deleteTemplate(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM workspace_templates WHERE id = ?').run(id)
  if (result.changes > 0) {
    log.info('Template deleted', { id })
    return true
  }
  return false
}

export function cloneTemplate(id: string, createdBy?: string): WorkspaceTemplate | null {
  const existing = getTemplate(id)
  if (!existing) return null

  const input: CreateTemplateInput = {
    name: `${existing.name} (副本)`,
    description: existing.description,
    category: existing.category,
    claude_md: existing.claude_md,
    skills: JSON.parse(existing.skills as any),
    hooks: JSON.parse(existing.hooks as any),
    mcp_servers: JSON.parse(existing.mcp_servers as any),
    rules: JSON.parse(existing.rules as any),
    review_gates: JSON.parse(existing.review_gates as any),
    input_schema: JSON.parse(existing.input_schema as any),
    output_description: existing.output_description,
    is_public: false,
    is_starter: false,
    created_by: createdBy,
  }

  return createTemplate(input)
}

export function previewClaudeDir(id: string): object | null {
  const template = getTemplate(id)
  if (!template) return null

  return {
    'CLAUDE.md': template.claude_md,
    'settings.json': {
      hooks: JSON.parse(template.hooks as any),
      mcpServers: JSON.parse(template.mcp_servers as any),
    },
    'skills/': JSON.parse(template.skills as any).map((s: ComponentRef) => s.component_id),
    'rules/': JSON.parse(template.rules as any).map((r: RuleRef) => r.component_id),
    '_reviewGates': JSON.parse(template.review_gates as any),
    '_inputSchema': JSON.parse(template.input_schema as any),
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/workspace-template-service.ts
git commit -m "feat(ws-v2): rewrite template service with v2 fields, clone, and preview"
```

---

### Task 5: Workspace Session Service — Gate-driven 状态机

**Files:**
- Rewrite: `server/src/services/workspace-session-service.ts`

- [ ] **Step 1: 重写 session service**

```typescript
import { getDb } from '../db/client'
import type { WorkspaceSession, ReviewRecord, SegmentState, ReviewGate } from '../db/schema'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-session-service')

export interface CreateSessionInput {
  template_id: string
  input: Record<string, unknown>
  created_by?: string
}

function rowToSession(row: any): WorkspaceSession {
  return {
    ...row,
    input: JSON.parse(row.input || '{}'),
    output: row.output ? JSON.parse(row.output) : null,
    review_history: JSON.parse(row.review_history || '[]'),
    context: JSON.parse(row.context || '{}'),
    segment_states: JSON.parse(row.segment_states || '{}'),
  } as WorkspaceSession
}

function getSegmentStates(gates: ReviewGate[]): Record<string, SegmentState> {
  const totalSegments = gates.length + 1
  const states: Record<string, SegmentState> = {}
  for (let i = 0; i < totalSegments; i++) {
    const key = `segment_${i}`
    states[key] = {
      status: 'pending',
      started_at: '',
      completed_at: '',
      output: null,
      error: null,
    }
  }
  return states
}

export function listSessions(): WorkspaceSession[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM workspace_sessions ORDER BY created_at DESC').all() as any[]
  return rows.map(rowToSession)
}

export function getSession(id: string): WorkspaceSession | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_sessions WHERE id = ?').get(id) as any
  if (!row) return null
  return rowToSession(row)
}

export function getSessionForUser(id: string): Record<string, unknown> | null {
  const session = getSession(id)
  if (!session) return null
  const { segment_states, context, ...rest } = session as any
  return rest
}

export function createSession(input: CreateSessionInput): WorkspaceSession {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const template = db.prepare('SELECT review_gates, version FROM workspace_templates WHERE id = ?').get(input.template_id) as any
  if (!template) throw new Error('Template not found')

  const gates: ReviewGate[] = JSON.parse(template.review_gates || '[]')
  const segmentStates = getSegmentStates(gates)

  db.prepare(`
    INSERT INTO workspace_sessions (id, template_id, template_version, status, input, review_history, context, segment_states, created_by, created_at)
    VALUES (?, ?, ?, 'pending', ?, '[]', '{}', ?, ?, ?)
  `).run(
    id,
    input.template_id,
    template.version,
    JSON.stringify(input.input),
    JSON.stringify(segmentStates),
    input.created_by || null,
    now,
  )

  log.info('Session created', { id, template_id: input.template_id })
  return getSession(id)!
}

export function startSession(id: string): WorkspaceSession | null {
  const db = getDb()
  const session = getSession(id)
  if (!session) return null
  if (session.status !== 'pending') throw new Error(`Cannot start session in status: ${session.status}`)

  const now = new Date().toISOString()
  const segmentStates: Record<string, SegmentState> = JSON.parse(JSON.stringify(session.segment_states))
  segmentStates['segment_0'].status = 'running'
  segmentStates['segment_0'].started_at = now

  db.prepare(`
    UPDATE workspace_sessions SET status = 'running', started_at = ?, segment_states = ? WHERE id = ?
  `).run(now, JSON.stringify(segmentStates), id)

  log.info('Session started', { id })
  return getSession(id)
}

export function updateSessionStatus(id: string, status: string, updates?: Partial<WorkspaceSession>): WorkspaceSession | null {
  const db = getDb()
  const sets: string[] = ['status = ?']
  const params: any[] = [status]

  if (updates?.current_gate !== undefined) { sets.push('current_gate = ?'); params.push(updates.current_gate) }
  if (updates?.output !== undefined) { sets.push('output = ?'); params.push(JSON.stringify(updates.output)) }
  if (updates?.error !== undefined) { sets.push('error = ?'); params.push(updates.error) }
  if (updates?.review_history !== undefined) { sets.push('review_history = ?'); params.push(JSON.stringify(updates.review_history)) }
  if (updates?.context !== undefined) { sets.push('context = ?'); params.push(JSON.stringify(updates.context)) }
  if (updates?.segment_states !== undefined) { sets.push('segment_states = ?'); params.push(JSON.stringify(updates.segment_states)) }
  if (status === 'completed') { sets.push('completed_at = ?'); params.push(new Date().toISOString()) }

  params.push(id)
  db.prepare(`UPDATE workspace_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...params)

  return getSession(id)
}

export function reviewSession(sessionId: string, gateId: string, result: 'approved' | 'rejected', comment: string): WorkspaceSession | null {
  const session = getSession(sessionId)
  if (!session) return null
  if (session.status !== 'waiting_review') throw new Error('Session is not waiting for review')
  if (session.current_gate !== gateId) throw new Error(`Current gate is ${session.current_gate}, not ${gateId}`)

  const now = new Date().toISOString()
  const reviewHistory: ReviewRecord[] = JSON.parse(JSON.stringify(session.review_history))
  reviewHistory.push({ gateId, result, comment, reviewed_at: now })

  if (result === 'approved') {
    return updateSessionStatus(sessionId, 'running', {
      current_gate: null,
      review_history: reviewHistory as any,
    })
  } else {
    return updateSessionStatus(sessionId, 'running', {
      review_history: reviewHistory as any,
    })
  }
}

export function cancelSession(id: string): WorkspaceSession | null {
  const session = getSession(id)
  if (!session) return null
  if (!['pending', 'running', 'waiting_review'].includes(session.status)) {
    throw new Error(`Cannot cancel session in status: ${session.status}`)
  }
  return updateSessionStatus(id, 'cancelled')
}

export function retrySession(sessionId: string, gateId: string): WorkspaceSession | null {
  const session = getSession(sessionId)
  if (!session) return null
  if (session.status !== 'failed') throw new Error('Can only retry failed sessions')

  const template = getDb().prepare('SELECT review_gates FROM workspace_templates WHERE id = ?').get(session.template_id) as any
  if (!template) return null
  const gates: ReviewGate[] = JSON.parse(template.review_gates || '[]')
  const gateIndex = gates.findIndex(g => g.id === gateId)
  if (gateIndex === -1) throw new Error(`Gate ${gateId} not found`)

  const segmentIndex = gateIndex + 1
  const segmentStates: Record<string, SegmentState> = JSON.parse(JSON.stringify(session.segment_states))
  segmentStates[`segment_${segmentIndex}`].status = 'pending'
  segmentStates[`segment_${segmentIndex}`].error = null

  return updateSessionStatus(sessionId, 'running', {
    segment_states: segmentStates as any,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/workspace-session-service.ts
git commit -m "feat(ws-v2): rewrite session service with gate-driven state machine"
```

---

### Task 6: Claude Instance — .claude/ 组装适配

**Files:**
- Modify: `server/src/services/claude-instance.ts`

- [ ] **Step 1: 新增 assembleWorkspaceClaudeDir 和 buildSegmentPrompt 函数**

在文件中保留现有 `assembleClaudeConfig`（仍被 task 模块使用），新增 V2 专用函数。需要确保文件顶部已有 `import path from 'path'` 和 `import fs from 'fs'`。

```typescript
import type { ComponentRef, HookConfig, McpConfig, RuleRef } from '../db/schema'

/**
 * V2: 从 workspace template 组装 .claude/ 目录
 * 所有段共享同一配置
 */
export function assembleWorkspaceClaudeDir(
  workDir: string,
  template: {
    claude_md: string
    skills: string
    hooks: string
    mcp_servers: string
    rules: string
  },
  componentResolver?: (id: string) => { type: string; content: string } | null
): void {
  const claudeDir = path.join(workDir, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(claudeDir, 'rules'), { recursive: true })

  // 1. CLAUDE.md
  fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), template.claude_md, 'utf-8')

  // 2. 解析组件引用
  const skillRefs: ComponentRef[] = JSON.parse(template.skills || '[]')
  const hookConfigs: HookConfig[] = JSON.parse(template.hooks || '[]')
  const mcpConfigs: McpConfig[] = JSON.parse(template.mcp_servers || '[]')
  const ruleRefs: RuleRef[] = JSON.parse(template.rules || '[]')

  // 3. Skills 和 Rules — 从已安装组件复制
  if (componentResolver) {
    for (const ref of skillRefs) {
      const comp = componentResolver(ref.component_id)
      if (comp && comp.type === 'skill') {
        fs.writeFileSync(path.join(claudeDir, 'skills', `${ref.component_id}.md`), comp.content, 'utf-8')
      }
    }
    for (const ref of ruleRefs) {
      const comp = componentResolver(ref.component_id)
      if (comp && comp.type === 'rule') {
        fs.writeFileSync(path.join(claudeDir, 'rules', `${ref.component_id}.md`), comp.content, 'utf-8')
      }
    }
  }

  // 4. settings.json — hooks + mcpServers
  const hooksMap: Record<string, any[]> = {}
  for (const h of hookConfigs) {
    const event = h.event
    if (!hooksMap[event]) hooksMap[event] = []
    hooksMap[event].push({
      matcher: h.matcher,
      hooks: [{ type: 'command', command: h.command }],
    })
  }

  const mcpServersMap: Record<string, any> = {}
  for (const m of mcpConfigs) {
    mcpServersMap[m.name] = {
      command: m.command,
      args: m.args,
      env: m.env,
    }
  }

  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
    hooks: hooksMap,
    mcpServers: mcpServersMap,
  }, null, 2), 'utf-8')
}

/**
 * V2: 构建段 prompt
 */
export function buildSegmentPrompt(params: {
  claudeMd: string
  input: Record<string, unknown>
  context: Record<string, unknown>
  segmentIndex: number
  totalSegments: number
  lastRejection?: { gateId: string; comment: string } | null
}): string {
  const parts: string[] = []

  parts.push('## 你的任务')
  parts.push('执行 CLAUDE.md 中定义的工作流程。')
  parts.push(`当前是第 ${params.segmentIndex + 1}/${params.totalSegments} 段执行。`)

  parts.push('')
  parts.push('## 输入')
  parts.push(JSON.stringify(params.input, null, 2))

  if (Object.keys(params.context).length > 0) {
    parts.push('')
    parts.push('## 前序产出')
    for (const [key, value] of Object.entries(params.context)) {
      parts.push(`### ${key}`)
      parts.push(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    }
  }

  if (params.lastRejection) {
    parts.push('')
    parts.push('## 审核反馈')
    parts.push(`审核点 "${params.lastRejection.gateId}" 被拒绝。`)
    parts.push(`拒绝原因：${params.lastRejection.comment}`)
    parts.push('请根据反馈修订你的产出。')
  }

  return parts.join('\n')
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/claude-instance.ts
git commit -m "feat(ws-v2): add workspace .claude/ assembly and segment prompt builder"
```

---

### Task 7: Workspace Executor — Gate-driven Segmentation

**Files:**
- Rewrite: `server/src/services/workspace-executor.ts`

- [ ] **Step 1: 重写 executor**

```typescript
import path from 'path'
import fs from 'fs'
import { getDb } from '../db/client'
import type { ReviewGate, SegmentState, ReviewRecord } from '../db/schema'
import { startClaudeInstance, assembleWorkspaceClaudeDir, buildSegmentPrompt } from './claude-instance'
import { broadcastGateReached, broadcastSessionCompleted, broadcastSessionFailed, broadcastSessionProgress } from '../ws/handler'
import * as sessionService from './workspace-session-service'
import * as templateService from './workspace-template-service'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-executor')

const WORKSPACE_BASE_DIR = process.env.WORKSPACE_BASE_DIR || path.join(process.cwd(), 'data', 'workspaces')

function getWorkspaceDir(sessionId: string): string {
  return path.join(WORKSPACE_BASE_DIR, sessionId)
}

function getTotalSegments(gates: ReviewGate[]): number {
  return gates.length + 1
}

function findCurrentSegmentIndex(segmentStates: Record<string, SegmentState>): number {
  for (const [key, state] of Object.entries(segmentStates)) {
    if (state.status === 'pending' || state.status === 'running') {
      const match = key.match(/^segment_(\d+)$/)
      if (match) return parseInt(match[1])
    }
  }
  return -1
}

function getGateAfterSegment(gates: ReviewGate[], segmentIndex: number): ReviewGate | null {
  if (segmentIndex < gates.length) {
    return gates[segmentIndex]
  }
  return null
}

function getLastRejection(reviewHistory: ReviewRecord[], gateId: string): { gateId: string; comment: string } | null {
  const records = [...reviewHistory].reverse()
  const rejection = records.find(r => r.gateId === gateId && r.result === 'rejected')
  if (!rejection) return null
  return { gateId: rejection.gateId, comment: rejection.comment }
}

export async function runSession(sessionId: string): Promise<void> {
  const session = sessionService.getSession(sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)

  const template = templateService.getTemplate(session.template_id)
  if (!template) throw new Error(`Template ${session.template_id} not found`)

  const gates: ReviewGate[] = JSON.parse(template.review_gates as any)
  const totalSegments = getTotalSegments(gates)

  let currentSession = sessionService.startSession(sessionId)
  if (!currentSession) throw new Error('Failed to start session')

  const workDir = getWorkspaceDir(sessionId)
  fs.mkdirSync(workDir, { recursive: true })

  const componentResolver = (id: string) => {
    const db = getDb()
    const row = db.prepare('SELECT type, content FROM components WHERE id = ?').get(id) as any
    return row || null
  }

  assembleWorkspaceClaudeDir(workDir, template, componentResolver)

  while (true) {
    const segSession = sessionService.getSession(sessionId)!
    const segmentStates: Record<string, SegmentState> = JSON.parse(JSON.stringify(segSession.segment_states))
    const currentSegmentIndex = findCurrentSegmentIndex(segmentStates)

    if (currentSegmentIndex === -1) {
      const lastCompletedSegment = segmentStates[`segment_${totalSegments - 1}`]
      sessionService.updateSessionStatus(sessionId, 'completed', {
        output: lastCompletedSegment.output,
      })
      broadcastSessionCompleted(sessionId, lastCompletedSegment.output)
      log.info('Session completed', { sessionId })
      return
    }

    broadcastSessionProgress(sessionId, currentSegmentIndex, totalSegments)

    const now = new Date().toISOString()
    segmentStates[`segment_${currentSegmentIndex}`].status = 'running'
    segmentStates[`segment_${currentSegmentIndex}`].started_at = now
    sessionService.updateSessionStatus(sessionId, 'running', {
      segment_states: segmentStates as any,
    })

    const gateAfterSegment = getGateAfterSegment(gates, currentSegmentIndex)
    const lastRejection = gateAfterSegment
      ? getLastRejection(JSON.parse(JSON.stringify(segSession.review_history)), gateAfterSegment.id)
      : null

    const prompt = buildSegmentPrompt({
      claudeMd: template.claude_md,
      input: JSON.parse(segSession.input as any),
      context: JSON.parse(segSession.context as any),
      segmentIndex: currentSegmentIndex,
      totalSegments,
      lastRejection,
    })

    try {
      const result = await startClaudeInstance(workDir, prompt)

      const completedNow = new Date().toISOString()
      const updatedStates: Record<string, SegmentState> = JSON.parse(
        JSON.stringify(sessionService.getSession(sessionId)!.segment_states)
      )
      updatedStates[`segment_${currentSegmentIndex}`].status = 'completed'
      updatedStates[`segment_${currentSegmentIndex}`].completed_at = completedNow
      updatedStates[`segment_${currentSegmentIndex}`].output = result

      if (gateAfterSegment) {
        sessionService.updateSessionStatus(sessionId, 'waiting_review', {
          current_gate: gateAfterSegment.id,
          segment_states: updatedStates as any,
        })
        broadcastGateReached(sessionId, gateAfterSegment.id, gateAfterSegment.name, result)
        log.info('Gate reached', { sessionId, gateId: gateAfterSegment.id })
        return
      }

      const context: Record<string, unknown> = JSON.parse(
        JSON.stringify(sessionService.getSession(sessionId)!.context)
      )
      context[`segment_${currentSegmentIndex}`] = result

      sessionService.updateSessionStatus(sessionId, 'running', {
        segment_states: updatedStates as any,
        context: context as any,
      })

      log.info('Segment completed', { sessionId, segmentIndex: currentSegmentIndex })
    } catch (err) {
      const failedNow = new Date().toISOString()
      const failedStates: Record<string, SegmentState> = JSON.parse(
        JSON.stringify(sessionService.getSession(sessionId)!.segment_states)
      )
      failedStates[`segment_${currentSegmentIndex}`].status = 'failed'
      failedStates[`segment_${currentSegmentIndex}`].completed_at = failedNow
      failedStates[`segment_${currentSegmentIndex}`].error = (err as Error).message

      sessionService.updateSessionStatus(sessionId, 'failed', {
        segment_states: failedStates as any,
        error: (err as Error).message,
      })
      broadcastSessionFailed(sessionId, (err as Error).message)
      log.error('Segment failed', { sessionId, segmentIndex: currentSegmentIndex, error: (err as Error).message })
      return
    }
  }
}

export async function continueAfterReview(sessionId: string, gateId: string, result: 'approved' | 'rejected', comment: string): Promise<void> {
  const session = sessionService.getSession(sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)

  const updated = sessionService.reviewSession(sessionId, gateId, result, comment)
  if (!updated) throw new Error('Review failed')

  if (result === 'approved') {
    const gates: ReviewGate[] = JSON.parse(
      templateService.getTemplate(session.template_id)!.review_gates as any
    )
    const gateIndex = gates.findIndex(g => g.id === gateId)
    const segmentIndex = gateIndex

    const segmentStates: Record<string, SegmentState> = JSON.parse(JSON.stringify(updated.segment_states))
    const context: Record<string, unknown> = JSON.parse(JSON.stringify(updated.context))
    context[`segment_${segmentIndex}`] = segmentStates[`segment_${segmentIndex}`].output

    sessionService.updateSessionStatus(sessionId, 'running', {
      context: context as any,
    })

    await runSession(sessionId)
  } else {
    const gates2: ReviewGate[] = JSON.parse(
      templateService.getTemplate(session.template_id)!.review_gates as any
    )
    const gateIndex2 = gates2.findIndex(g => g.id === gateId)
    const segIdx = gateIndex2

    const segStates: Record<string, SegmentState> = JSON.parse(JSON.stringify(updated.segment_states))
    segStates[`segment_${segIdx}`].status = 'pending'
    segStates[`segment_${segIdx}`].error = null

    sessionService.updateSessionStatus(sessionId, 'running', {
      segment_states: segStates as any,
    })

    await runSession(sessionId)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/workspace-executor.ts
git commit -m "feat(ws-v2): rewrite executor with gate-driven segmentation engine"
```

---

### Task 8: Workspace Template Routes — V2 API

**Files:**
- Rewrite: `server/src/routes/workspace-templates.ts`

- [ ] **Step 1: 重写路由**

```typescript
import { Hono } from 'hono'
import * as svc from '../services/workspace-template-service'

export const workspaceTemplateRoutes = new Hono()

workspaceTemplateRoutes.get('/', (c) => {
  const category = c.req.query('category')
  const starter = c.req.query('starter')
  const filters: { category?: string; starter?: boolean } = {}
  if (category) filters.category = category
  if (starter !== undefined) filters.starter = starter === 'true'

  const templates = svc.listTemplates(filters)
  return c.json({ templates })
})

workspaceTemplateRoutes.get('/:id', (c) => {
  const template = svc.getTemplate(c.req.param('id'))
  if (!template) return c.json({ error: 'Template not found' }, 404)
  return c.json({ template })
})

workspaceTemplateRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.name) return c.json({ error: 'name is required' }, 400)

  try {
    const template = svc.createTemplate({
      name: body.name,
      description: body.description,
      category: body.category,
      claude_md: body.claude_md,
      skills: body.skills,
      hooks: body.hooks,
      mcp_servers: body.mcp_servers,
      rules: body.rules,
      review_gates: body.review_gates,
      input_schema: body.input_schema,
      output_description: body.output_description,
      is_public: body.is_public,
      is_starter: body.is_starter,
      created_by: body.created_by,
    })
    return c.json({ template }, 201)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

workspaceTemplateRoutes.put('/:id', async (c) => {
  const body = await c.req.json()
  try {
    const template = svc.updateTemplate(c.req.param('id'), body)
    if (!template) return c.json({ error: 'Template not found' }, 404)
    return c.json({ template })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

workspaceTemplateRoutes.post('/:id/clone', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const template = svc.cloneTemplate(c.req.param('id'), body.created_by)
  if (!template) return c.json({ error: 'Template not found' }, 404)
  return c.json({ template }, 201)
})

workspaceTemplateRoutes.get('/:id/preview', (c) => {
  const preview = svc.previewClaudeDir(c.req.param('id'))
  if (!preview) return c.json({ error: 'Template not found' }, 404)
  return c.json({ preview })
})

workspaceTemplateRoutes.delete('/:id', (c) => {
  const ok = svc.deleteTemplate(c.req.param('id'))
  if (!ok) return c.json({ error: 'Template not found' }, 404)
  return c.json({ ok: true })
})
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/workspace-templates.ts
git commit -m "feat(ws-v2): rewrite template routes with clone, preview, category filter"
```

---

### Task 9: Workspace Session Routes — V2 API

**Files:**
- Rewrite: `server/src/routes/workspace-sessions.ts`

- [ ] **Step 1: 重写路由**

```typescript
import { Hono } from 'hono'
import * as svc from '../services/workspace-session-service'
import { continueAfterReview, runSession } from '../services/workspace-executor'

export const workspaceSessionRoutes = new Hono()

workspaceSessionRoutes.get('/', (c) => {
  const sessions = svc.listSessions()
  return c.json({ sessions })
})

workspaceSessionRoutes.get('/:id', (c) => {
  const session = svc.getSessionForUser(c.req.param('id'))
  if (!session) return c.json({ error: 'Session not found' }, 404)
  return c.json({ session })
})

workspaceSessionRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.template_id) return c.json({ error: 'template_id is required' }, 400)

  try {
    const session = svc.createSession({
      template_id: body.template_id,
      input: body.input || {},
      created_by: body.created_by,
    })
    return c.json({ session }, 201)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

workspaceSessionRoutes.post('/:id/start', async (c) => {
  const sessionId = c.req.param('id')
  try {
    runSession(sessionId).catch(() => {})
    return c.json({ ok: true, message: 'Session started' })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

workspaceSessionRoutes.post('/:id/review/:gateId', async (c) => {
  const sessionId = c.req.param('id')
  const gateId = c.req.param('gateId')
  const body = await c.req.json()

  if (!body.result || !['approved', 'rejected'].includes(body.result)) {
    return c.json({ error: 'result must be "approved" or "rejected"' }, 400)
  }
  if (body.result === 'rejected' && !body.comment) {
    return c.json({ error: 'comment is required when rejecting' }, 400)
  }

  try {
    continueAfterReview(sessionId, gateId, body.result, body.comment || '').catch(() => {})
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

workspaceSessionRoutes.post('/:id/retry/:gateId', async (c) => {
  const sessionId = c.req.param('id')
  const gateId = c.req.param('gateId')

  try {
    svc.retrySession(sessionId, gateId)
    runSession(sessionId).catch(() => {})
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

workspaceSessionRoutes.post('/:id/cancel', (c) => {
  try {
    const session = svc.cancelSession(c.req.param('id'))
    if (!session) return c.json({ error: 'Session not found' }, 404)
    return c.json({ session })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/workspace-sessions.ts
git commit -m "feat(ws-v2): rewrite session routes with gateId-based review and retry"
```

---

### Task 10: Starter 模板种子

**Files:**
- Create: `server/src/services/starter-templates.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 创建 starter 模板种子数据**

```typescript
import * as templateService from './workspace-template-service'
import { moduleLogger } from './logger'

const log = moduleLogger('starter-templates')

const STARTER_TEMPLATES = [
  {
    name: '需求分析',
    description: '分析需求文档，识别功能点、边界条件和隐含约束',
    category: '需求分析',
    claude_md: `# Role\n你是一位资深的测试需求分析师。你的任务是分析需求文档，产出结构化的需求分析结果。\n\n# Constraints\n- 必须覆盖所有功能点，不可遗漏\n- 每个功能点必须标注优先级（P0/P1/P2）\n- 必须识别隐含约束和边界条件\n\n# 执行流程\n1. 阅读并理解需求文档\n2. 识别所有功能点\n3. 为每个功能点标注优先级\n4. 识别边界条件和隐含约束\n5. 产出结构化分析结果\n<!-- GATE:requirement-confirmation -->\n6. 根据审核反馈修订分析结果（如有）`,
    review_gates: [
      { id: 'requirement-confirmation', name: '需求确认', description: '请确认需求分析结果是否准确完整' },
    ],
    input_schema: {
      type: 'object',
      properties: {
        requirement_doc: { type: 'string', title: '需求文档' },
      },
      required: ['requirement_doc'],
    },
    output_description: '结构化需求分析结果，包含功能点列表、优先级标注、边界条件和隐含约束',
    is_starter: true,
  },
  {
    name: '用例生成',
    description: '基于结构化需求，生成完整的测试用例集',
    category: '用例生成',
    claude_md: `# Role\n你是一位资深的测试工程师。你的任务是基于结构化需求，使用等价类划分、边界值分析等方法，生成完整的测试用例集。\n\n# Constraints\n- 每个功能点至少 3 条测试用例（正向/反向/边界）\n- 用例必须包含：前置条件、操作步骤、预期结果\n- 用例编号遵循 TC-{模块}-{序号} 格式\n\n# 执行流程\n1. 理解结构化需求\n2. 识别测试点\n3. 为每个测试点设计测试用例\n4. 产出测试用例集`,
    review_gates: [],
    input_schema: {
      type: 'object',
      properties: {
        structured_requirement: { type: 'string', title: '结构化需求' },
      },
      required: ['structured_requirement'],
    },
    output_description: '完整的测试用例集，每条用例包含前置条件、操作步骤和预期结果',
    is_starter: true,
  },
  {
    name: '缺陷分流',
    description: '分析缺陷描述，判断根因分类并生成缺陷报告',
    category: '缺陷分流',
    claude_md: `# Role\n你是一位资深的缺陷分析师。你的任务是分析缺陷描述，识别根因并分类（环境问题/代码缺陷/用例问题），生成标准缺陷报告。\n\n# Constraints\n- 根因分类只能三选一：环境问题/代码缺陷/用例问题\n- 必须给出复现步骤\n- 必须评估影响范围\n\n# 执行流程\n1. 理解缺陷描述\n2. 分析可能根因\n3. 分类根因\n4. 生成标准缺陷报告`,
    review_gates: [],
    input_schema: {
      type: 'object',
      properties: {
        bug_description: { type: 'string', title: '缺陷描述' },
      },
      required: ['bug_description'],
    },
    output_description: '标准缺陷报告，包含根因分类、复现步骤和影响范围评估',
    is_starter: true,
  },
]

export function seedStarterTemplates(): void {
  const existing = templateService.listTemplates({ starter: true })
  if (existing.length > 0) {
    log.info('Starter templates already exist, skipping seed')
    return
  }

  for (const t of STARTER_TEMPLATES) {
    templateService.createTemplate({
      name: t.name,
      description: t.description,
      category: t.category,
      claude_md: t.claude_md,
      review_gates: t.review_gates,
      input_schema: t.input_schema,
      output_description: t.output_description,
      is_public: true,
      is_starter: t.is_starter,
      created_by: 'system',
    })
  }

  log.info('Starter templates seeded', { count: STARTER_TEMPLATES.length })
}
```

- [ ] **Step 2: 在 server/src/index.ts 中调用 seed**

在 `migrate()` 调用之后加入 seed 调用。添加 import：

```typescript
import { seedStarterTemplates } from './services/starter-templates'
```

在 `migrate()` 之后加入：

```typescript
seedStarterTemplates()
```

- [ ] **Step 3: 验证服务器启动和种子数据**

Run: `cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test && bun run server/src/index.ts &`
等待 2 秒后：`curl -s http://localhost:3000/api/workspace-templates?starter=true`
Expected: JSON 包含 3 个 starter 模板

杀掉：`kill %1`

- [ ] **Step 4: Commit**

```bash
git add server/src/services/starter-templates.ts server/src/index.ts
git commit -m "feat(ws-v2): add 3 starter templates with auto-seed on startup"
```

---

### Task 11: 前端 API Client

**Files:**
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: 更新 workspace API 方法**

替换 `api.workspaceTemplates` 和 `api.workspaceSessions` 对象：

```typescript
workspaceTemplates: {
  list: (params?: { category?: string; starter?: boolean }) => {
    const query = new URLSearchParams()
    if (params?.category) query.set('category', params.category)
    if (params?.starter !== undefined) query.set('starter', String(params.starter))
    const qs = query.toString()
    return request<any>(`/api/workspace-templates${qs ? '?' + qs : ''}`)
  },
  get: (id: string) => request<any>(`/api/workspace-templates/${id}`),
  create: (data: any) => request<any>('/api/workspace-templates', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/api/workspace-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<any>(`/api/workspace-templates/${id}`, { method: 'DELETE' }),
  clone: (id: string, createdBy?: string) => request<any>(`/api/workspace-templates/${id}/clone`, { method: 'POST', body: JSON.stringify({ created_by: createdBy }) }),
  preview: (id: string) => request<any>(`/api/workspace-templates/${id}/preview`),
},

workspaceSessions: {
  list: () => request<any>('/api/workspace-sessions'),
  get: (id: string) => request<any>(`/api/workspace-sessions/${id}`),
  create: (data: any) => request<any>('/api/workspace-sessions', { method: 'POST', body: JSON.stringify(data) }),
  start: (id: string) => request<any>(`/api/workspace-sessions/${id}/start`, { method: 'POST' }),
  review: (id: string, gateId: string, result: 'approved' | 'rejected', comment: string) =>
    request<any>(`/api/workspace-sessions/${id}/review/${gateId}`, { method: 'POST', body: JSON.stringify({ result, comment }) }),
  retry: (id: string, gateId: string) =>
    request<any>(`/api/workspace-sessions/${id}/retry/${gateId}`, { method: 'POST' }),
  cancel: (id: string) => request<any>(`/api/workspace-sessions/${id}/cancel`, { method: 'POST' }),
},
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat(ws-v2): update frontend API client with v2 routes and gateId params"
```

---

### Task 12: 前端 Store 适配

**Files:**
- Modify: `web/src/lib/store.ts`

- [ ] **Step 1: 更新 store 的 fetchWorkspaceTemplates 支持筛选**

修改 `fetchWorkspaceTemplates` 函数签名和实现：

```typescript
fetchWorkspaceTemplates: async (filters?: { category?: string; starter?: boolean }) => {
  set({ loadingWorkspaceTemplates: true })
  try {
    const res = await api.workspaceTemplates.list(filters)
    set({ workspaceTemplates: res.templates || [], loadingWorkspaceTemplates: false })
  } catch {
    set({ loadingWorkspaceTemplates: false })
  }
},
```

其余 store 逻辑不需要修改。

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/store.ts
git commit -m "feat(ws-v2): add filter params to fetchWorkspaceTemplates in store"
```

---

### Task 13: 前端路由与导航

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/Layout.tsx`

- [ ] **Step 1: 添加新路由**

在 App.tsx 中导入新页面：

```tsx
import WorkspaceTaskLaunch from './pages/WorkspaceTaskLaunch'
```

在 Routes 中添加：

```tsx
<Route path="/workspace-task-launch" element={<WorkspaceTaskLaunch />} />
```

- [ ] **Step 2: 更新导航为双角色**

修改 Layout.tsx 的 navItems，将工作模板/工作会话改为环境模板/任务执行/执行记录：

```tsx
{ to: '/workspace-templates', label: '环境模板', icon: GitBranch },
{ to: '/workspace-task-launch', label: '任务执行', icon: Play },
{ to: '/workspace-sessions', label: '执行记录', icon: Monitor },
```

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx web/src/components/Layout.tsx
git commit -m "feat(ws-v2): add dual-role navigation and task-launch route"
```

---

### Task 14: 构建者界面 — WorkspaceTemplates 重写

**Files:**
- Rewrite: `web/src/pages/WorkspaceTemplates.tsx`

- [ ] **Step 1: 重写为左右分栏编辑器**

实现完整的构建者编辑器：左侧 60% CLAUDE.md 编辑器（含预览切换），右侧 40% 配置面板（基础信息、审核点定义器、输入 Schema 编辑器、产出描述、组件配置高级折叠区、元数据）。模板列表显示分类、审核点数、内置标记。包含 clone 和 preview 功能。

核心结构要点：
- 列表卡片显示 `category`、`review_gates.length`、`is_starter` 标记
- 编辑器模态框宽度 95vw/1200px，高度 85vh
- 左侧 textarea 编辑 CLAUDE.md，可切换预览模式
- 右侧可滚动配置面板：name/description/category/outputDescription + reviewGates 列表（id/name/description）+ inputSchema JSON 编辑器 + 组件配置折叠区（skills/hooks/mcpServers/rules JSON 编辑器）+ isPublic/isStarter 复选框
- 保存前验证 name 和 JSON 格式
- 预览按钮调用 `api.workspaceTemplates.preview()`

（完整代码见计划文件 `docs/superpowers/plans/2026-06-16-workspace-orchestration-v2.md` Task 14 Step 1）

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/WorkspaceTemplates.tsx
git commit -m "feat(ws-v2): rewrite builder UI with CLAUDE.md editor + config panel layout"
```

---

### Task 15: 使用者界面 — 任务启动页

**Files:**
- Create: `web/src/pages/WorkspaceTaskLaunch.tsx`

- [ ] **Step 1: 创建极简任务启动页**

实现使用者视角的 3 步任务启动：1) 卡片选择任务类型 2) 根据 inputSchema 动态渲染输入表单 3) 一键启动跳转会话详情。

核心结构要点：
- 加载所有公开模板（`api.workspaceTemplates.list()`）
- 卡片网格展示：name + description + outputDescription + category + is_starter 标记
- 选中后显示 `DynamicInputForm`：根据 inputSchema.properties 渲染字段（string→textarea, 其他→input），required 字段标红
- 启动时验证必填字段，调用 `api.workspaceSessions.create()` + `api.workspaceSessions.start()`
- 成功后 `navigate('/workspace-sessions?id=sessionId')`

（完整代码见计划文件 Task 15 Step 1）

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/WorkspaceTaskLaunch.tsx
git commit -m "feat(ws-v2): add user task-launch page with dynamic input form"
```

---

### Task 16: 使用者界面 — 会话详情重写

**Files:**
- Rewrite: `web/src/pages/WorkspaceSessions.tsx`

- [ ] **Step 1: 重写为使用者视角的会话列表+详情**

实现使用者视角：左侧列表 + 右侧详情。详情显示状态徽标、段进度条、输入/产出/错误、审核面板、审核历史。

核心结构要点：
- STATUS_MAP 映射：pending→灰色, running→蓝色, waiting_review→橙色, completed→绿色, failed→红色, cancelled→灰色
- URL 参数 `?id=xxx` 自动选中会话
- running/waiting_review 时 3 秒轮询更新
- 审核面板（仅 waiting_review 时显示）：当前产出 + 通过/拒绝按钮 + 评论输入（拒绝必填）
- 进度条：`completed/total` 段
- 审核历史：approved 绿色、rejected 红色

（完整代码见计划文件 Task 16 Step 1）

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/WorkspaceSessions.tsx
git commit -m "feat(ws-v2): rewrite session UI with gate-based review and user-facing design"
```

---

### Task 17: 端到端验证

**Files:** 无新增/修改

- [ ] **Step 1: 启动完整应用验证**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
rm -f data/db/autoruner.db
bun run server/src/index.ts &
cd web && npm run dev &
```

- [ ] **Step 2: 验证后端 API**

```bash
curl -s http://localhost:3000/api/workspace-templates?starter=true
# Expected: JSON 包含 3 个 starter 模板

curl -s -X POST http://localhost:3000/api/workspace-templates \
  -H 'Content-Type: application/json' \
  -d '{"name":"测试模板","category":"测试","claude_md":"# Test","input_schema":{"type":"object","properties":{"input":{"type":"string"}}},"created_by":"test"}'
# Expected: 201 创建成功
```

- [ ] **Step 3: 验证前端页面**

浏览器访问：
- `http://localhost:5173/workspace-templates` — 构建者编辑器
- `http://localhost:5173/workspace-task-launch` — 使用者任务启动
- `http://localhost:5173/workspace-sessions` — 使用者会话记录

- [ ] **Step 4: 清理测试进程**

```bash
kill %1 %2
```

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "feat(ws-v2): complete workspace orchestration v2 implementation"
```

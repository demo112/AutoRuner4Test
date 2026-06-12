# AutoRuner4Test Phase 1 — 后端核心 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建可部署的后端服务，支持组件 Registry CRUD、任务创建/启动/确认、Claude Code headless 实例管理、WebSocket 实时推送、Docker 打包。

**Architecture:** Bun + Hono 单进程服务。SQLite 存元数据，BullMQ + Redis 做任务队列，文件系统存产出物。每个任务启动独立 Claude Code headless 实例，通过 `.claude/` 目录注入选定组件。

**Tech Stack:** Bun, Hono, better-sqlite3, BullMQ, Redis, Docker, Claude CLI

**Spec:** `docs/superpowers/specs/2026-06-12-autoruner4test-design.md`

---

## 文件结构

```
server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # 入口：Hono app + 启动
│   ├── db/
│   │   ├── schema.ts               # 建表 SQL + 类型
│   │   ├── migrate.ts              # 初始化/迁移
│   │   └── client.ts               # SQLite 连接单例
│   ├── routes/
│   │   ├── components.ts           # 组件 CRUD API
│   │   ├── tasks.ts                # 任务 API
│   │   └── knowledge.ts            # 知识库 API
│   ├── services/
│   │   ├── component-registry.ts   # 组件安装/卸载/配置逻辑
│   │   ├── task-runner.ts          # 任务状态机 + Claude Code 实例管理
│   │   ├── claude-instance.ts      # Claude Code headless 进程管理
│   │   ├── artifact-store.ts       # 产出物存取
│   │   └── knowledge-store.ts      # 知识库文件系统操作
│   ├── ws/
│   │   └── handler.ts              # WebSocket 消息推送
│   └── queue/
│       ├── worker.ts               # BullMQ worker：执行任务
│       └── producer.ts             # BullMQ producer：入队
├── data/                           # 运行时数据（.gitignore）
│   ├── db/                         # SQLite 文件
│   ├── components/                 # 组件源码
│   ├── artifacts/                  # 任务产出物
│   └── knowledge/                  # Obsidian 知识库
├── Dockerfile
└── docker-compose.yml
```

---

### Task 1: 项目脚手架

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/index.ts`
- Create: `server/.gitignore`

- [ ] **Step 1: 初始化 Bun 项目**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
mkdir -p server/src
cd server
bun init -y
```

- [ ] **Step 2: 安装核心依赖**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
bun add hono better-sqlite3 bullmq
bun add -d @types/better-sqlite3 typescript
```

- [ ] **Step 3: 配置 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["bun-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 写最小入口 `src/index.ts`**

```typescript
import { Hono } from 'hono'
import { serve } from 'bun'

const app = new Hono()

app.get('/', (c) => c.json({ name: 'autoruner4test', version: '0.1.0' }))

app.get('/api/health', (c) => c.json({ status: 'ok' }))

const port = Number(process.env.PORT) || 3000
serve({
  fetch: app.fetch,
  port,
})
console.log(`Server running on port ${port}`)
```

- [ ] **Step 5: 写 .gitignore**

```
node_modules/
dist/
data/
*.db
```

- [ ] **Step 6: 验证启动**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
bun run src/index.ts &
sleep 2
curl http://localhost:3000/api/health
# 期望: {"status":"ok"}
kill %1
```

- [ ] **Step 7: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/
git commit -m "feat: scaffold server with Hono + Bun"
```

---

### Task 2: SQLite 数据库 Schema + 迁移

**Files:**
- Create: `server/src/db/schema.ts`
- Create: `server/src/db/migrate.ts`
- Create: `server/src/db/client.ts`

- [ ] **Step 1: 写数据库 Schema `src/db/schema.ts`**

```typescript
export interface Component {
  id: string
  name: string
  type: 'skill' | 'hook' | 'mcp' | 'rule'
  version: string
  description: string
  author: string
  config_schema: string          // JSON string
  dependencies: string           // JSON string, array of component ids
  source: string
  installed: number              // 0 or 1
  enabled: number                // 0 or 1
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  type: 'requirement-analysis' | 'testcase-generation' | 'script-conversion' | 'execution-analysis' | 'issue-triage'
  status: 'pending' | 'running' | 'review' | 'approved' | 'completed' | 'failed'
  component_ids: string          // JSON string, array of component ids
  config: string                 // JSON string
  input_artifact_id: string | null
  output_artifact_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface Artifact {
  id: string
  task_id: string
  name: string
  type: string                   // 对应 task type
  file_path: string
  created_at: string
}

export interface Knowledge {
  id: string
  type: 'pattern' | 'lesson' | 'defect_pattern' | 'script_template'
  source_task_id: string | null
  title: string
  content: string                // Markdown
  tags: string                   // JSON string
  created_at: string
  updated_at: string
}

export const CREATE_COMPONENTS_TABLE = `
CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('skill', 'hook', 'mcp', 'rule')),
  version TEXT NOT NULL DEFAULT '0.1.0',
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  config_schema TEXT NOT NULL DEFAULT '{}',
  dependencies TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT '',
  installed INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`

export const CREATE_TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('requirement-analysis', 'testcase-generation', 'script-conversion', 'execution-analysis', 'issue-triage')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'review', 'approved', 'completed', 'failed')),
  component_ids TEXT NOT NULL DEFAULT '[]',
  config TEXT NOT NULL DEFAULT '{}',
  input_artifact_id TEXT,
  output_artifact_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`

export const CREATE_ARTIFACTS_TABLE = `
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`

export const CREATE_KNOWLEDGE_TABLE = `
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('pattern', 'lesson', 'defect_pattern', 'script_template')),
  source_task_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`
```

- [ ] **Step 2: 写数据库客户端 `src/db/client.ts`**

```typescript
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'db', 'autoruner.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH)
    fs.mkdirSync(dir, { recursive: true })
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
```

- [ ] **Step 3: 写迁移脚本 `src/db/migrate.ts`**

```typescript
import { getDb } from './client'
import {
  CREATE_COMPONENTS_TABLE,
  CREATE_TASKS_TABLE,
  CREATE_ARTIFACTS_TABLE,
  CREATE_KNOWLEDGE_TABLE,
} from './schema'

export function migrate(): void {
  const db = getDb()
  db.exec(CREATE_COMPONENTS_TABLE)
  db.exec(CREATE_TASKS_TABLE)
  db.exec(CREATE_ARTIFACTS_TABLE)
  db.exec(CREATE_KNOWLEDGE_TABLE)
  console.log('Database migration complete')
}
```

- [ ] **Step 4: 更新 `src/index.ts` 集成数据库初始化**

```typescript
import { Hono } from 'hono'
import { serve } from 'bun'
import { migrate } from './db/migrate'
import { closeDb } from './db/client'

const app = new Hono()

app.get('/', (c) => c.json({ name: 'autoruner4test', version: '0.1.0' }))
app.get('/api/health', (c) => c.json({ status: 'ok' }))

// 启动时迁移
migrate()

const port = Number(process.env.PORT) || 3000
serve({
  fetch: app.fetch,
  port,
})
console.log(`Server running on port ${port}`)

// 优雅关闭
process.on('SIGINT', () => {
  closeDb()
  process.exit(0)
})
```

- [ ] **Step 5: 验证数据库创建**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
bun run src/index.ts &
sleep 2
# 检查数据库文件
ls -la data/db/autoruner.db
# 期望: 文件存在
# 检查表
sqlite3 data/db/autoruner.db ".tables"
# 期望: artifacts components knowledge tasks
kill %1
rm -rf data/
```

- [ ] **Step 6: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/db/
git add server/src/index.ts
git commit -m "feat: add SQLite schema, migration, and db client"
```

---

### Task 3: 组件 Registry API

**Files:**
- Create: `server/src/routes/components.ts`
- Create: `server/src/services/component-registry.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 写组件注册服务 `src/services/component-registry.ts`**

```typescript
import { getDb } from '../db/client'
import type { Component } from '../db/schema'
import { randomUUID } from 'crypto'

export function listComponents(type?: string, installedOnly?: boolean): Component[] {
  const db = getDb()
  let sql = 'SELECT * FROM components WHERE 1=1'
  const params: string[] = []
  if (type) {
    sql += ' AND type = ?'
    params.push(type)
  }
  if (installedOnly) {
    sql += ' AND installed = 1'
  }
  sql += ' ORDER BY created_at DESC'
  return db.prepare(sql).all(...params) as Component[]
}

export function getComponent(id: string): Component | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM components WHERE id = ?').get(id) as Component | undefined
}

export function installComponent(data: {
  name: string
  type: 'skill' | 'hook' | 'mcp' | 'rule'
  version?: string
  description?: string
  author?: string
  config_schema?: Record<string, any>
  dependencies?: string[]
  source: string
}): Component {
  const db = getDb()
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO components (id, name, type, version, description, author, config_schema, dependencies, source, installed, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(
    id, data.name, data.type, data.version || '0.1.0',
    data.description || '', data.author || '',
    JSON.stringify(data.config_schema || {}),
    JSON.stringify(data.dependencies || []),
    data.source, now, now
  )
  return getComponent(id)!
}

export function uninstallComponent(id: string): boolean {
  const db = getDb()
  const result = db.prepare('UPDATE components SET installed = 0, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
  return result.changes > 0
}

export function updateComponentConfig(id: string, config: Record<string, any>): Component | undefined {
  const db = getDb()
  db.prepare('UPDATE components SET config_schema = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(config), new Date().toISOString(), id)
  return getComponent(id)
}

export function getComponentSchema(id: string): Record<string, any> | undefined {
  const comp = getComponent(id)
  if (!comp) return undefined
  return JSON.parse(comp.config_schema)
}

export function toggleComponent(id: string, enabled: boolean): Component | undefined {
  const db = getDb()
  db.prepare('UPDATE components SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, new Date().toISOString(), id)
  return getComponent(id)
}
```

- [ ] **Step 2: 写组件路由 `src/routes/components.ts`**

```typescript
import { Hono } from 'hono'
import {
  listComponents,
  getComponent,
  installComponent,
  uninstallComponent,
  updateComponentConfig,
  getComponentSchema,
  toggleComponent,
} from '../services/component-registry'

export const componentRoutes = new Hono()

// 列出所有组件
componentRoutes.get('/', (c) => {
  const type = c.req.query('type') as string | undefined
  const installedOnly = c.req.query('installed') === 'true'
  const components = listComponents(type, installedOnly)
  return c.json({ components })
})

// 获取单个组件
componentRoutes.get('/:id', (c) => {
  const comp = getComponent(c.req.param('id'))
  if (!comp) return c.json({ error: 'Component not found' }, 404)
  return c.json({ component: comp })
})

// 安装组件
componentRoutes.post('/install', async (c) => {
  const body = await c.req.json()
  if (!body.name || !body.type || !body.source) {
    return c.json({ error: 'name, type, source are required' }, 400)
  }
  if (!['skill', 'hook', 'mcp', 'rule'].includes(body.type)) {
    return c.json({ error: 'type must be skill, hook, mcp, or rule' }, 400)
  }
  const comp = installComponent(body)
  return c.json({ component: comp }, 201)
})

// 卸载组件
componentRoutes.delete('/:id', (c) => {
  const ok = uninstallComponent(c.req.param('id'))
  if (!ok) return c.json({ error: 'Component not found' }, 404)
  return c.json({ ok: true })
})

// 更新组件配置
componentRoutes.put('/:id/config', async (c) => {
  const body = await c.req.json()
  const comp = updateComponentConfig(c.req.param('id'), body)
  if (!comp) return c.json({ error: 'Component not found' }, 404)
  return c.json({ component: comp })
})

// 获取组件配置 schema
componentRoutes.get('/:id/schema', (c) => {
  const schema = getComponentSchema(c.req.param('id'))
  if (!schema) return c.json({ error: 'Component not found' }, 404)
  return c.json({ schema })
})

// 启用/禁用组件
componentRoutes.patch('/:id/toggle', async (c) => {
  const body = await c.req.json()
  const comp = toggleComponent(c.req.param('id'), body.enabled)
  if (!comp) return c.json({ error: 'Component not found' }, 404)
  return c.json({ component: comp })
})
```

- [ ] **Step 3: 更新 `src/index.ts` 注册路由**

在 `src/index.ts` 中添加路由注册：

```typescript
import { componentRoutes } from './routes/components'

// ... 在 app.get('/api/health'...) 之后添加:
app.route('/api/components', componentRoutes)
```

- [ ] **Step 4: 验证组件 API**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
rm -rf data/
bun run src/index.ts &
sleep 2

# 安装一个组件
curl -s -X POST http://localhost:3000/api/components/install \
  -H 'Content-Type: application/json' \
  -d '{"name":"requirement-analysis","type":"skill","source":"./skills/requirement-analysis","description":"解析需求文档"}' | jq .

# 列出组件
curl -s http://localhost:3000/api/components | jq .

# 获取组件 schema
COMPONENT_ID=$(curl -s http://localhost:3000/api/components | jq -r '.components[0].id')
curl -s http://localhost:3000/api/components/$COMPONENT_ID/schema | jq .

# 卸载
curl -s -X DELETE http://localhost:3000/api/components/$COMPONENT_ID | jq .

kill %1
rm -rf data/
```

- [ ] **Step 5: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/routes/components.ts server/src/services/component-registry.ts server/src/index.ts
git commit -m "feat: add component registry API (CRUD + install/uninstall)"
```

---

### Task 4: 任务 API + 状态机

**Files:**
- Create: `server/src/routes/tasks.ts`
- Create: `server/src/services/task-runner.ts`
- Create: `server/src/services/artifact-store.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 写产出物存储服务 `src/services/artifact-store.ts`**

```typescript
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { getDb } from '../db/client'

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || path.join(process.cwd(), 'data', 'artifacts')

export function ensureDir(): void {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
}

export function saveArtifact(taskId: string, name: string, type: string, content: string): string {
  ensureDir()
  const id = randomUUID()
  const taskDir = path.join(ARTIFACTS_DIR, taskId)
  fs.mkdirSync(taskDir, { recursive: true })
  const filePath = path.join(taskDir, name)
  fs.writeFileSync(filePath, content, 'utf-8')

  const db = getDb()
  db.prepare(`
    INSERT INTO artifacts (id, task_id, name, type, file_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, taskId, name, type, filePath, new Date().toISOString())

  // 更新任务的 output_artifact_id
  db.prepare('UPDATE tasks SET output_artifact_id = ?, updated_at = ? WHERE id = ?')
    .run(id, new Date().toISOString(), taskId)

  return id
}

export function getArtifact(id: string): { name: string; content: string; type: string } | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as any
  if (!row) return null
  const content = fs.readFileSync(row.file_path, 'utf-8')
  return { name: row.name, content, type: row.type }
}

export function getArtifactsByTask(taskId: string): any[] {
  const db = getDb()
  return db.prepare('SELECT id, name, type, created_at FROM artifacts WHERE task_id = ?').all(taskId)
}
```

- [ ] **Step 2: 写任务运行器 `src/services/task-runner.ts`**

```typescript
import { getDb } from '../db/client'
import type { Task } from '../db/schema'
import { randomUUID } from 'crypto'

// 任务类型配置：每种类型的默认确认点和描述
const TASK_TYPE_CONFIG: Record<string, { needsReview: boolean; description: string }> = {
  'requirement-analysis': { needsReview: true, description: '需求分析' },
  'testcase-generation': { needsReview: false, description: '用例生成' },
  'script-conversion': { needsReview: false, description: '脚本转换' },
  'execution-analysis': { needsReview: true, description: '执行分析' },
  'issue-triage': { needsReview: true, description: '提单处理' },
}

export function createTask(data: {
  type: Task['type']
  component_ids?: string[]
  config?: Record<string, any>
  input_artifact_id?: string
}): Task {
  const db = getDb()
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO tasks (id, type, status, component_ids, config, input_artifact_id, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(
    id, data.type,
    JSON.stringify(data.component_ids || []),
    JSON.stringify(data.config || {}),
    data.input_artifact_id || null,
    now, now
  )
  return getTask(id)!
}

export function getTask(id: string): Task | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
}

export function listTasks(type?: string, status?: string): Task[] {
  const db = getDb()
  let sql = 'SELECT * FROM tasks WHERE 1=1'
  const params: string[] = []
  if (type) {
    sql += ' AND type = ?'
    params.push(type)
  }
  if (status) {
    sql += ' AND status = ?'
    params.push(status)
  }
  sql += ' ORDER BY created_at DESC'
  return db.prepare(sql).all(...params) as Task[]
}

// 状态机转换
const VALID_TRANSITIONS: Array<{ from: Task['status']; to: Task['status'] }> = [
  { from: 'pending', to: 'running' },
  { from: 'running', to: 'review' },
  { from: 'running', to: 'failed' },
  { from: 'review', to: 'approved' },
  { from: 'review', to: 'failed' },
  { from: 'approved', to: 'completed' },
  { from: 'failed', to: 'pending' },
]

function canTransition(from: Task['status'], to: Task['status']): boolean {
  return VALID_TRANSITIONS.some(t => t.from === from && t.to === to)
}

export function transitionTask(id: string, newStatus: Task['status']): Task | { error: string } {
  const task = getTask(id)
  if (!task) return { error: 'Task not found' }
  if (!canTransition(task.status, newStatus)) {
    return { error: `Cannot transition from ${task.status} to ${newStatus}` }
  }
  const db = getDb()
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(newStatus, new Date().toISOString(), id)
  return getTask(id)!
}

export function startTask(id: string): Task | { error: string } {
  return transitionTask(id, 'running')
}

export function approveTask(id: string): Task | { error: string } {
  const result = transitionTask(id, 'approved')
  if ('error' in result) return result
  // 自动推进到 completed
  return transitionTask(id, 'completed')
}

export function rejectTask(id: string): Task | { error: string } {
  return transitionTask(id, 'failed')
}

export function retryTask(id: string): Task | { error: string } {
  return transitionTask(id, 'pending')
}

export function getTaskTypeInfo(type: string) {
  return TASK_TYPE_CONFIG[type] || null
}
```

- [ ] **Step 3: 写任务路由 `src/routes/tasks.ts`**

```typescript
import { Hono } from 'hono'
import {
  createTask,
  getTask,
  listTasks,
  startTask,
  approveTask,
  rejectTask,
  retryTask,
} from '../services/task-runner'
import { getArtifact, getArtifactsByTask } from '../services/artifact-store'

export const taskRoutes = new Hono()

// 任务列表
taskRoutes.get('/', (c) => {
  const type = c.req.query('type') as string | undefined
  const status = c.req.query('status') as string | undefined
  return c.json({ tasks: listTasks(type, status) })
})

// 创建任务
taskRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.type) return c.json({ error: 'type is required' }, 400)
  const validTypes = ['requirement-analysis', 'testcase-generation', 'script-conversion', 'execution-analysis', 'issue-triage']
  if (!validTypes.includes(body.type)) {
    return c.json({ error: `type must be one of: ${validTypes.join(', ')}` }, 400)
  }
  const task = createTask(body)
  return c.json({ task }, 201)
})

// 任务详情
taskRoutes.get('/:id', (c) => {
  const task = getTask(c.req.param('id'))
  if (!task) return c.json({ error: 'Task not found' }, 404)
  return c.json({ task })
})

// 启动任务
taskRoutes.post('/:id/start', (c) => {
  const result = startTask(c.req.param('id'))
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json({ task: result })
})

// 确认任务
taskRoutes.post('/:id/approve', (c) => {
  const result = approveTask(c.req.param('id'))
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json({ task: result })
})

// 驳回任务
taskRoutes.post('/:id/reject', (c) => {
  const result = rejectTask(c.req.param('id'))
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json({ task: result })
})

// 重试任务
taskRoutes.post('/:id/retry', (c) => {
  const result = retryTask(c.req.param('id'))
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json({ task: result })
})

// 获取任务产出物
taskRoutes.get('/:id/artifacts', (c) => {
  const taskId = c.req.param('id')
  const task = getTask(taskId)
  if (!task) return c.json({ error: 'Task not found' }, 404)
  return c.json({ artifacts: getArtifactsByTask(taskId) })
})

// 获取单个产出物内容
taskRoutes.get('/:id/artifact', async (c) => {
  const artifactId = c.req.query('artifact_id')
  if (!artifactId) return c.json({ error: 'artifact_id query param required' }, 400)
  const artifact = getArtifact(artifactId)
  if (!artifact) return c.json({ error: 'Artifact not found' }, 404)
  return c.json(artifact)
})
```

- [ ] **Step 4: 更新 `src/index.ts` 注册任务路由**

```typescript
import { taskRoutes } from './routes/tasks'

// 在组件路由之后添加:
app.route('/api/tasks', taskRoutes)
```

- [ ] **Step 5: 验证任务 API 全流程**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
rm -rf data/
bun run src/index.ts &
sleep 2

# 创建任务
TASK_ID=$(curl -s -X POST http://localhost:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"type":"requirement-analysis"}' | jq -r '.task.id')
echo "Task ID: $TASK_ID"

# 查看任务
curl -s http://localhost:3000/api/tasks/$TASK_ID | jq '.task.status'
# 期望: "pending"

# 启动任务
curl -s -X POST http://localhost:3000/api/tasks/$TASK_ID/start | jq '.task.status'
# 期望: "running"

# 列出所有任务
curl -s http://localhost:3000/api/tasks | jq '.tasks | length'
# 期望: 1

kill %1
rm -rf data/
```

- [ ] **Step 6: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/routes/tasks.ts server/src/services/task-runner.ts server/src/services/artifact-store.ts server/src/index.ts
git commit -m "feat: add task API with state machine + artifact store"
```

---

### Task 5: Claude Code Headless 实例管理

**Files:**
- Create: `server/src/services/claude-instance.ts`

- [ ] **Step 1: 写 Claude Code 实例管理 `src/services/claude-instance.ts`**

```typescript
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'

const WORK_DIR_BASE = process.env.WORK_DIR_BASE || path.join(process.cwd(), 'data', 'workdirs')
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_INSTANCES) || 3

interface ClaudeInstance {
  id: string
  taskId: string
  process: ChildProcess | null
  workDir: string
  status: 'starting' | 'running' | 'completed' | 'failed'
  stdout: string
  stderr: string
  startedAt: string
  completedAt: string | null
}

const activeInstances = new Map<string, ClaudeInstance>()

// 为任务组装 .claude 目录
function assembleClaudeConfig(
  workDir: string,
  components: Array<{ type: string; name: string; source: string }>,
  config: Record<string, any>,
): void {
  const claudeDir = path.join(workDir, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(claudeDir, 'hooks'), { recursive: true })

  const hooks: any[] = []
  const mcps: Record<string, any> = {}
  let rulesContent = ''

  for (const comp of components) {
    if (comp.type === 'skill') {
      // 复制 skill 源码到工作目录
      if (comp.source && fs.existsSync(comp.source)) {
        const dest = path.join(claudeDir, 'skills', comp.name)
        if (!fs.existsSync(dest)) {
          fs.cpSync(comp.source, dest, { recursive: true })
        }
      }
    } else if (comp.type === 'hook') {
      hooks.push({ name: comp.name, source: comp.source })
    } else if (comp.type === 'mcp') {
      mcps[comp.name] = config[comp.name] || {}
    } else if (comp.type === 'rule') {
      rulesContent += `\n<!-- Rule: ${comp.name} -->\n${config[comp.name] || ''}\n`
    }
  }

  // 写 settings.json（MCP + hook 配置）
  const settings: any = {}
  if (Object.keys(mcps).length > 0) {
    settings.mcpServers = mcps
  }
  if (hooks.length > 0) {
    settings.hooks = hooks
  }
  if (Object.keys(settings).length > 0) {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2))
  }

  // 写 CLAUDE.md（Rules）
  if (rulesContent) {
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), rulesContent)
  }
}

// 构建任务指令 prompt
function buildTaskPrompt(taskType: string, config: Record<string, any>, inputContent?: string): string {
  const prompts: Record<string, string> = {
    'requirement-analysis': `请分析以下需求文档，识别功能点、边界条件和隐含约束。输出结构化的需求分析结果。\n\n${inputContent || '请提供需求文档内容。'}`,
    'testcase-generation': `请根据以下结构化需求，生成测试用例。使用等价类划分、边界值分析等方法。\n\n${inputContent || '请提供结构化需求。'}`,
    'script-conversion': `请将以下测试用例转换为自动化测试脚本。\n\n${inputContent || '请提供测试用例。'}`,
    'execution-analysis': `请分析以下测试执行报告，识别失败根因并分类（环境问题/代码缺陷/用例问题）。\n\n${inputContent || '请提供测试报告。'}`,
    'issue-triage': `请根据以下问题分析结果，生成缺陷描述并判断是否需要提单。\n\n${inputContent || '请提供问题分析结果。'}`,
  }
  return prompts[taskType] || '请执行任务。'
}

export function canStartInstance(): boolean {
  return activeInstances.size < MAX_CONCURRENT
}

export function getActiveCount(): number {
  return activeInstances.size
}

export function startClaudeInstance(
  taskId: string,
  taskType: string,
  components: Array<{ type: string; name: string; source: string }>,
  config: Record<string, any>,
  inputContent?: string,
): { instanceId: string; error?: string } {
  if (!canStartInstance()) {
    return { instanceId: '', error: `Max concurrent instances (${MAX_CONCURRENT}) reached` }
  }

  const instanceId = randomUUID()
  const workDir = path.join(WORK_DIR_BASE, taskId)
  fs.mkdirSync(workDir, { recursive: true })

  // 组装 .claude 配置
  assembleClaudeConfig(workDir, components, config)

  // 写输入文件（如果有）
  if (inputContent) {
    fs.writeFileSync(path.join(workDir, 'input.md'), inputContent)
  }

  const prompt = buildTaskPrompt(taskType, config, inputContent)

  const instance: ClaudeInstance = {
    id: instanceId,
    taskId,
    process: null,
    workDir,
    status: 'starting',
    stdout: '',
    stderr: '',
    startedAt: new Date().toISOString(),
    completedAt: null,
  }

  // 启动 Claude Code headless（使用 spawn 防止 shell 注入）
  const args = ['--print', '-p', prompt, '--output-format', 'json']
  const proc = spawn('claude', args, {
    cwd: workDir,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  instance.process = proc
  instance.status = 'running'

  proc.stdout?.on('data', (data: Buffer) => {
    instance.stdout += data.toString()
  })

  proc.stderr?.on('data', (data: Buffer) => {
    instance.stderr += data.toString()
  })

  proc.on('close', (code) => {
    instance.status = code === 0 ? 'completed' : 'failed'
    instance.completedAt = new Date().toISOString()
    instance.process = null
  })

  activeInstances.set(instanceId, instance)
  return { instanceId }
}

export function getInstanceStatus(instanceId: string): ClaudeInstance | undefined {
  return activeInstances.get(instanceId)
}

export function getInstancesByTask(taskId: string): ClaudeInstance[] {
  return Array.from(activeInstances.values()).filter(i => i.taskId === taskId)
}

export function stopInstance(instanceId: string): boolean {
  const instance = activeInstances.get(instanceId)
  if (!instance || !instance.process) return false
  instance.process.kill('SIGTERM')
  instance.status = 'failed'
  instance.completedAt = new Date().toISOString()
  return true
}

// 清理已完成的实例
export function cleanupCompleted(): number {
  let count = 0
  for (const [id, instance] of activeInstances) {
    if (instance.status === 'completed' || instance.status === 'failed') {
      activeInstances.delete(id)
      count++
    }
  }
  return count
}
```

- [ ] **Step 2: 验证代码加载**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
bun run -e "
import { canStartInstance, getActiveCount } from './src/services/claude-instance'
console.log('canStart:', canStartInstance())
console.log('activeCount:', getActiveCount())
"
# 期望: canStart: true, activeCount: 0
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/services/claude-instance.ts
git commit -m "feat: add Claude Code headless instance manager"
```

---

### Task 6: BullMQ 任务队列 + Worker

**Files:**
- Create: `server/src/queue/producer.ts`
- Create: `server/src/queue/worker.ts`
- Modify: `server/src/routes/tasks.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 写队列 producer `src/queue/producer.ts`**

```typescript
import { Queue } from 'bullmq'

const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379

export const taskQueue = new Queue('tasks', {
  connection: { host: REDIS_HOST, port: REDIS_PORT },
})

export async function enqueueTask(
  taskId: string,
  taskType: string,
  componentIds: string[],
  config: Record<string, any>,
  inputArtifactId?: string,
) {
  await taskQueue.add('run-task', {
    taskId,
    taskType,
    componentIds,
    config,
    inputArtifactId,
  }, {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  })
}
```

- [ ] **Step 2: 写队列 worker `src/queue/worker.ts`**

```typescript
import { Worker, Job } from 'bullmq'
import { getDb } from '../db/client'
import { getArtifact, saveArtifact } from '../services/artifact-store'
import { startClaudeInstance, getInstanceStatus, canStartInstance } from '../services/claude-instance'

const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379

// 轮询等待实例完成
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

export function createWorker(): Worker {
  const worker = new Worker('tasks', async (job: Job) => {
    const { taskId, taskType, componentIds, config, inputArtifactId } = job.data

    // 获取组件信息
    const db = getDb()
    const components = componentIds.length > 0
      ? db.prepare(`SELECT * FROM components WHERE id IN (${componentIds.map(() => '?').join(',')}) AND installed = 1`).all(...componentIds) as any[]
      : []

    // 获取输入产出物内容
    let inputContent: string | undefined
    if (inputArtifactId) {
      const artifact = getArtifact(inputArtifactId)
      inputContent = artifact?.content
    }

    // 等待实例槽位
    while (!canStartInstance()) {
      await new Promise(r => setTimeout(r, 5000))
    }

    // 启动 Claude Code 实例
    const result = startClaudeInstance(
      taskId,
      taskType,
      components.map(c => ({ type: c.type, name: c.name, source: c.source })),
      config,
      inputContent,
    )

    if (result.error) {
      throw new Error(result.error)
    }

    // 更新任务状态为 running
    db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run('running', new Date().toISOString(), taskId)

    // 等待完成
    const instanceResult = await waitForInstance(result.instanceId)

    if (instanceResult.status === 'completed') {
      // 保存产出物
      const artifactId = saveArtifact(taskId, `${taskType}-output.md`, taskType, instanceResult.stdout)

      // 检查是否需要人工确认
      const typeConfig: Record<string, boolean> = {
        'requirement-analysis': true,
        'testcase-generation': false,
        'script-conversion': false,
        'execution-analysis': true,
        'issue-triage': true,
      }
      const needsReview = typeConfig[taskType] ?? false

      const newStatus = needsReview ? 'review' : 'completed'
      db.prepare('UPDATE tasks SET status = ?, output_artifact_id = ?, updated_at = ? WHERE id = ?')
        .run(newStatus, artifactId, new Date().toISOString(), taskId)
    } else {
      db.prepare('UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE id = ?')
        .run('failed', instanceResult.stderr, new Date().toISOString(), taskId)
    }
  }, {
    connection: { host: REDIS_HOST, port: REDIS_PORT },
    concurrency: 1,
  })

  worker.on('failed', (job, err) => {
    console.error(`Task ${job?.data.taskId} failed:`, err.message)
  })

  return worker
}
```

- [ ] **Step 3: 更新任务路由，启动时入队**

替换 `src/routes/tasks.ts` 中 `POST /:id/start` 的实现：

```typescript
import { enqueueTask } from '../queue/producer'

// 修改 POST /:id/start：
taskRoutes.post('/:id/start', async (c) => {
  const task = getTask(c.req.param('id'))
  if (!task) return c.json({ error: 'Task not found' }, 404)
  if (task.status !== 'pending') return c.json({ error: `Task is ${task.status}, not pending` }, 400)

  const componentIds = JSON.parse(task.component_ids)
  const config = JSON.parse(task.config)
  await enqueueTask(task.id, task.type, componentIds, config, task.input_artifact_id || undefined)

  return c.json({ task, message: 'Task queued' })
})
```

- [ ] **Step 4: 更新 `src/index.ts` 启动 Worker**

在启动逻辑中添加：

```typescript
import { createWorker } from './queue/worker'

// 在 migrate() 之后添加:
if (process.env.SKIP_REDIS !== 'true') {
  try {
    createWorker()
    console.log('Task worker started')
  } catch (e) {
    console.warn('Redis not available, task worker not started:', (e as Error).message)
  }
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/queue/ server/src/routes/tasks.ts server/src/index.ts
git commit -m "feat: add BullMQ task queue + worker for Claude Code execution"
```

---

### Task 7: WebSocket 实时推送

**Files:**
- Create: `server/src/ws/handler.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/services/task-runner.ts`

- [ ] **Step 1: 写 WebSocket handler `src/ws/handler.ts`**

```typescript
import { WebSocket } from 'ws'

interface Client {
  ws: WebSocket
  subscriptions: Set<string>  // 订阅的 task id，'*' = 全部
}

const clients = new Map<string, Client>()

export function addClient(id: string, ws: WebSocket): void {
  const client: Client = { ws, subscriptions: new Set(['*']) }
  clients.set(id, client)

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'subscribe' && msg.taskId) {
        client.subscriptions.add(msg.taskId)
      }
      if (msg.type === 'unsubscribe' && msg.taskId) {
        client.subscriptions.delete(msg.taskId)
      }
    } catch {
      // 忽略非法消息
    }
  })

  ws.on('close', () => {
    clients.delete(id)
  })
}

function shouldNotify(client: Client, taskId: string): boolean {
  return client.subscriptions.has('*') || client.subscriptions.has(taskId)
}

export function broadcast(event: string, taskId: string, data: any): void {
  const message = JSON.stringify({ event, taskId, data, timestamp: new Date().toISOString() })
  for (const client of clients.values()) {
    if (shouldNotify(client, taskId) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message)
    }
  }
}

export function getClientCount(): number {
  return clients.size
}
```

- [ ] **Step 2: 安装 ws 依赖**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
bun add ws
bun add -d @types/ws
```

- [ ] **Step 3: 更新 `src/index.ts` 添加 WebSocket 服务器**

在 `src/index.ts` 的启动逻辑中添加：

```typescript
import { WebSocketServer } from 'ws'
import { addClient } from './ws/handler'
import { randomUUID } from 'crypto'

// 在 serve() 之后添加:
const wss = new WebSocketServer({ port: port + 1 })
wss.on('connection', (ws) => {
  const clientId = randomUUID()
  addClient(clientId, ws)
  ws.send(JSON.stringify({ event: 'connected', clientId }))
})
console.log(`WebSocket server running on port ${port + 1}`)
```

- [ ] **Step 4: 在 task-runner 中添加广播**

在 `src/services/task-runner.ts` 顶部添加：

```typescript
import { broadcast } from '../ws/handler'
```

在 `transitionTask` 函数中，`db.prepare(...).run(...)` 之后添加：

```typescript
broadcast('task:status-changed', id, { from: task.status, to: newStatus })
if (newStatus === 'review') {
  broadcast('task:review-requested', id, { task: getTask(id) })
}
```

- [ ] **Step 5: 验证 WebSocket 端口**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
rm -rf data/
bun run src/index.ts &
sleep 2
# 验证端口在监听
lsof -i :3001 | head -5
kill %1
rm -rf data/
```

- [ ] **Step 6: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/ws/ server/src/index.ts server/src/services/task-runner.ts server/package.json
git commit -m "feat: add WebSocket real-time push for task events"
```

---

### Task 8: 知识库 API

**Files:**
- Create: `server/src/routes/knowledge.ts`
- Create: `server/src/services/knowledge-store.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 写知识库存储服务 `src/services/knowledge-store.ts`**

```typescript
import { getDb } from '../db/client'
import type { Knowledge } from '../db/schema'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'

const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || path.join(process.cwd(), 'data', 'knowledge')

export function createKnowledge(data: {
  type: Knowledge['type']
  source_task_id?: string
  title: string
  content: string
  tags?: string[]
}): Knowledge {
  const db = getDb()
  const id = randomUUID()
  const now = new Date().toISOString()
  const tags = data.tags || []

  db.prepare(`
    INSERT INTO knowledge (id, type, source_task_id, title, content, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.type, data.source_task_id || null, data.title, data.content, JSON.stringify(tags), now, now)

  // 同时写入 Obsidian 格式文件
  const filePath = path.join(KNOWLEDGE_DIR, `${id}.md`)
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true })
  const frontmatter = `---
type: ${data.type}
source_task: ${data.source_task_id || ''}
tags: [${tags.join(', ')}]
created: ${now}
---

`
  fs.writeFileSync(filePath, frontmatter + data.content)

  return getKnowledge(id)!
}

export function getKnowledge(id: string): Knowledge | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id) as Knowledge | undefined
}

export function listKnowledge(type?: string, tag?: string): Knowledge[] {
  const db = getDb()
  let sql = 'SELECT * FROM knowledge WHERE 1=1'
  const params: string[] = []
  if (type) {
    sql += ' AND type = ?'
    params.push(type)
  }
  if (tag) {
    sql += ' AND tags LIKE ?'
    params.push(`%"${tag}"%`)
  }
  sql += ' ORDER BY created_at DESC'
  return db.prepare(sql).all(...params) as Knowledge[]
}

export function updateKnowledge(id: string, data: Partial<Pick<Knowledge, 'title' | 'content' | 'tags' | 'type'>>): Knowledge | undefined {
  const db = getDb()
  const existing = getKnowledge(id)
  if (!existing) return undefined

  const updates: string[] = []
  const params: any[] = []

  if (data.title !== undefined) { updates.push('title = ?'); params.push(data.title) }
  if (data.content !== undefined) { updates.push('content = ?'); params.push(data.content) }
  if (data.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(data.tags)) }
  if (data.type !== undefined) { updates.push('type = ?'); params.push(data.type) }

  if (updates.length === 0) return existing

  updates.push("updated_at = datetime('now')")
  params.push(id)
  db.prepare(`UPDATE knowledge SET ${updates.join(', ')} WHERE id = ?`).run(...params)

  // 同步更新 Obsidian 文件
  const updated = getKnowledge(id)!
  const filePath = path.join(KNOWLEDGE_DIR, `${id}.md`)
  if (fs.existsSync(filePath)) {
    const parsedTags: string[] = JSON.parse(updated.tags)
    const frontmatter = `---
type: ${updated.type}
source_task: ${updated.source_task_id || ''}
tags: [${parsedTags.join(', ')}]
created: ${updated.created_at}
---

`
    fs.writeFileSync(filePath, frontmatter + updated.content)
  }

  return updated
}

export function searchKnowledge(query: string): Knowledge[] {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM knowledge WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC'
  ).all(`%${query}%`, `%${query}%`) as Knowledge[]
}
```

- [ ] **Step 2: 写知识库路由 `src/routes/knowledge.ts`**

```typescript
import { Hono } from 'hono'
import {
  createKnowledge,
  getKnowledge,
  listKnowledge,
  updateKnowledge,
  searchKnowledge,
} from '../services/knowledge-store'

export const knowledgeRoutes = new Hono()

knowledgeRoutes.get('/', (c) => {
  const type = c.req.query('type') as string | undefined
  const tag = c.req.query('tag') as string | undefined
  return c.json({ items: listKnowledge(type, tag) })
})

knowledgeRoutes.get('/search', (c) => {
  const q = c.req.query('q')
  if (!q) return c.json({ error: 'q query param required' }, 400)
  return c.json({ items: searchKnowledge(q) })
})

knowledgeRoutes.get('/:id', (c) => {
  const item = getKnowledge(c.req.param('id'))
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json({ item })
})

knowledgeRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.type || !body.title) {
    return c.json({ error: 'type and title are required' }, 400)
  }
  const item = createKnowledge(body)
  return c.json({ item }, 201)
})

knowledgeRoutes.put('/:id', async (c) => {
  const body = await c.req.json()
  const item = updateKnowledge(c.req.param('id'), body)
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json({ item })
})
```

- [ ] **Step 3: 更新 `src/index.ts` 注册知识库路由**

```typescript
import { knowledgeRoutes } from './routes/knowledge'

app.route('/api/knowledge', knowledgeRoutes)
```

- [ ] **Step 4: 验证知识库 API**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
rm -rf data/
bun run src/index.ts &
sleep 2

# 创建知识条目
curl -s -X POST http://localhost:3000/api/knowledge \
  -H 'Content-Type: application/json' \
  -d '{"type":"lesson","title":"登录接口边界值","content":"密码长度边界需测试0、1、6、7、128字符","tags":["login","boundary"]}' | jq .

# 搜索
curl -s "http://localhost:3000/api/knowledge/search?q=登录" | jq .

# 列出
curl -s http://localhost:3000/api/knowledge | jq .

kill %1
rm -rf data/
```

- [ ] **Step 5: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/routes/knowledge.ts server/src/services/knowledge-store.ts server/src/index.ts
git commit -m "feat: add knowledge base API with Obsidian file sync"
```

---

### Task 9: Docker 打包

**Files:**
- Create: `server/Dockerfile`
- Create: `server/docker-compose.yml`

- [ ] **Step 1: 写 Dockerfile**

```dockerfile
FROM oven/bun:1 AS base

WORKDIR /app

# 安装依赖
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# 复制源码
COPY src/ src/

# 创建数据目录
RUN mkdir -p data/db data/components data/artifacts data/knowledge data/workdirs

# 安装 Claude Code CLI
RUN bun add -g @anthropic-ai/claude-code

# 暴露端口
EXPOSE 3000 3001

# 启动
CMD ["bun", "run", "src/index.ts"]
```

- [ ] **Step 2: 写 docker-compose.yml**

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      - PORT=3000
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - DB_PATH=/app/data/db/autoruner.db
      - ARTIFACTS_DIR=/app/data/artifacts
      - KNOWLEDGE_DIR=/app/data/knowledge
      - WORK_DIR_BASE=/app/data/workdirs
      - MAX_CONCURRENT_INSTANCES=3
    volumes:
      - app-data:/app/data
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

volumes:
  app-data:
  redis-data:
```

- [ ] **Step 3: 验证 Docker 构建**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
docker compose build
# 期望: 构建成功
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/Dockerfile server/docker-compose.yml
git commit -m "feat: add Docker packaging with docker-compose"
```

---

### Task 10: 端到端集成测试

**Files:**
- Create: `server/src/__tests__/integration.test.ts`

- [ ] **Step 1: 写集成测试 `src/__tests__/integration.test.ts`**

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { getDb, closeDb } from '../db/client'
import { migrate } from '../db/migrate'
import { installComponent, listComponents, uninstallComponent } from '../services/component-registry'
import { createTask, getTask, startTask, approveTask, rejectTask, retryTask } from '../services/task-runner'
import { createKnowledge, searchKnowledge } from '../services/knowledge-store'

describe('Integration: Component Registry', () => {
  beforeAll(() => {
    process.env.DB_PATH = ':memory:'
    migrate()
  })

  afterAll(() => {
    closeDb()
  })

  test('install and list components', () => {
    const comp = installComponent({
      name: 'requirement-analysis',
      type: 'skill',
      source: './skills/requirement-analysis',
      description: '解析需求文档',
    })
    expect(comp.id).toBeDefined()
    expect(comp.installed).toBe(1)

    const all = listComponents()
    expect(all.length).toBe(1)

    const skills = listComponents('skill')
    expect(skills.length).toBe(1)
  })

  test('uninstall component', () => {
    const comps = listComponents()
    const id = comps[0].id
    const ok = uninstallComponent(id)
    expect(ok).toBe(true)

    const updated = listComponents(undefined, true)
    expect(updated.length).toBe(0)
  })
})

describe('Integration: Task lifecycle', () => {
  test('create → start → review → approve → completed', () => {
    const task = createTask({ type: 'requirement-analysis' })
    expect(task.status).toBe('pending')

    const started = startTask(task.id)
    if ('error' in started) throw new Error(started.error)
    expect(started.status).toBe('running')

    // 手动模拟到达 review 状态
    const db = getDb()
    db.prepare("UPDATE tasks SET status = 'review', updated_at = datetime('now') WHERE id = ?").run(task.id)

    const approved = approveTask(task.id)
    if ('error' in approved) throw new Error(approved.error)
    expect(approved.status).toBe('completed')
  })

  test('create → reject → retry', () => {
    const task = createTask({ type: 'requirement-analysis' })
    startTask(task.id)

    const db = getDb()
    db.prepare("UPDATE tasks SET status = 'review', updated_at = datetime('now') WHERE id = ?").run(task.id)

    const rejected = rejectTask(task.id)
    if ('error' in rejected) throw new Error(rejected.error)
    expect(rejected.status).toBe('failed')

    const retried = retryTask(task.id)
    if ('error' in retried) throw new Error(retried.error)
    expect(retried.status).toBe('pending')
  })
})

describe('Integration: Knowledge base', () => {
  test('create and search knowledge', () => {
    const item = createKnowledge({
      type: 'lesson',
      title: '登录接口边界值',
      content: '密码长度边界需测试0、1、6、7、128字符',
      tags: ['login', 'boundary'],
    })
    expect(item.id).toBeDefined()

    const results = searchKnowledge('登录')
    expect(results.length).toBe(1)
    expect(results[0].title).toBe('登录接口边界值')
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/server
bun test src/__tests__/integration.test.ts
# 期望: 全部通过
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/__tests__/
git commit -m "test: add integration tests for component, task, knowledge APIs"
```

---

## 自检

**1. Spec 覆盖检查：**
- ✅ 组件 Registry CRUD → Task 3
- ✅ 组件热插拔 → Task 3（install/uninstall 不需重启）
- ✅ 任务创建/启动/确认/驳回 → Task 4
- ✅ 任务状态机 → Task 4
- ✅ 产出物存取 → Task 4
- ✅ Claude Code headless 实例管理 → Task 5
- ✅ 任务队列 → Task 6
- ✅ WebSocket 实时推送 → Task 7
- ✅ 知识库 API → Task 8
- ✅ Docker 打包 → Task 9
- ✅ 集成测试 → Task 10
- ❌ 前端 → Phase 2 计划
- ❌ Skill/Hook/MCP/Rule 具体实现 → Phase 3 计划
- ❌ 鉴权/安全 → Phase 5 计划

**2. Placeholder 扫描：** 无 TBD/TODO

**3. 类型一致性：** Component、Task、Artifact、Knowledge 类型在 schema.ts 定义，各 service/route 引用一致。使用 `spawn`（非 `exec`）启动 Claude Code 进程。

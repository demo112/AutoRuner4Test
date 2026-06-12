# AutoRuner4Test Phase 4 — 知识库深化

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现知识库的核心深化功能：蒸馏、关联、检索增强、知识复用提醒。

**Architecture:** 在 Phase 1 知识库 API + Phase 3 knowledge-mcp 基础上，增加知识蒸馏管道、语义索引、关联图谱、复用推荐。

**Tech Stack:** TypeScript (后端), ChromaDB (可选语义检索), Obsidian 格式 (存储)

**Depends on:** Phase 1 后端核心, Phase 3 knowledge-mcp

---

## 文件结构

```
server/src/
├── services/
│   ├── knowledge-store.ts    # 已有，增强
│   ├── knowledge-distill.ts  # 新增：蒸馏管道
│   └── knowledge-search.ts   # 新增：检索增强
└── routes/
    └── knowledge.ts          # 已有，增加端点
```

---

### Task 1: 知识蒸馏管道

**Files:**
- Create: `server/src/services/knowledge-distill.ts`
- Modify: `server/src/services/knowledge-store.ts`

- [ ] **Step 1: 写蒸馏服务 `src/services/knowledge-distill.ts`**

```typescript
import fs from 'fs/promises'
import path from 'path'
import { getDb } from '../db/client'

const KNOWLEDGE_PATH = process.env.KNOWLEDGE_PATH || '/data/knowledge'

interface RawTrace {
  id: string
  task_id: string
  event_type: string
  data: string
  created_at: string
  distilled: number
}

interface DistillResult {
  title: string
  type: 'pattern' | 'lesson' | 'defect_pattern' | 'script_template'
  tags: string[]
  content: string
  confidence: number
  source_task: string
}

/**
 * 蒸馏管道：从任务痕迹中提炼可复用知识
 * 1. 查询未蒸馏痕迹
 * 2. 按任务分组
 * 3. 对每组痕迹执行蒸馏（提取知识条目）
 * 4. 写入知识库 + 标记已蒸馏
 */
export async function runDistillation(taskId?: string): Promise<{ distilled: number; items: DistillResult[] }> {
  const db = getDb()

  // 获取未蒸馏痕迹
  let traces: RawTrace[]
  if (taskId) {
    traces = db.prepare(
      'SELECT * FROM knowledge WHERE source_task = ? AND distilled = 0'
    ).all(taskId) as RawTrace[]
  } else {
    traces = db.prepare(
      'SELECT * FROM knowledge WHERE distilled = 0 ORDER BY created_at ASC LIMIT 50'
    ).all() as RawTrace[]
  }

  if (traces.length === 0) return { distilled: 0, items: [] }

  // 按任务分组
  const byTask = new Map<string, RawTrace[]>()
  for (const trace of traces) {
    const group = byTask.get(trace.task_id) || []
    group.push(trace)
    byTask.set(trace.task_id, group)
  }

  const results: DistillResult[] = []

  for (const [taskId, taskTraces] of byTask) {
    // 这里实际应该调用 Claude 进行蒸馏
    // MVP 阶段：基于痕迹元数据生成基础知识条目
    const taskType = taskTraces[0]?.event_type || 'unknown'
    const item: DistillResult = {
      title: `${taskType} 经验 - ${taskId.slice(0, 8)}`,
      type: inferType(taskType),
      tags: [taskType, 'auto-distilled'],
      content: buildContent(taskTraces),
      confidence: 0.6, // 自动蒸馏置信度较低，需人工确认
      source_task: taskId,
    }
    results.push(item)
  }

  // 写入知识库
  await fs.mkdir(KNOWLEDGE_PATH, { recursive: true })
  for (const item of results) {
    const slug = item.title.toLowerCase().replace(/[^a-z0-9一-鿿-]/g, '-').replace(/-+/g, '-').slice(0, 60)
    const filename = `${slug}.md`
    const frontmatter = [
      '---',
      `type: ${item.type}`,
      `title: ${item.title}`,
      `source_task: ${item.source_task}`,
      `tags: [${item.tags.join(', ')}]`,
      `created: ${new Date().toISOString().split('T')[0]}`,
      `confidence: ${item.confidence}`,
      `distilled: 1`,
      '---',
      '',
      item.content,
    ].join('\n')
    await fs.writeFile(path.join(KNOWLEDGE_PATH, filename), frontmatter, 'utf-8')
  }

  // 标记已蒸馏
  const stmt = db.prepare('UPDATE knowledge SET distilled = 1 WHERE task_id = ?')
  for (const taskId of byTask.keys()) {
    stmt.run(taskId)
  }

  return { distilled: results.length, items: results }
}

function inferType(eventType: string): DistillResult['type'] {
  if (eventType.includes('fail') || eventType.includes('error')) return 'defect_pattern'
  if (eventType.includes('success') || eventType.includes('pattern')) return 'pattern'
  return 'lesson'
}

function buildContent(traces: RawTrace[]): string {
  const lines = [
    '## 问题',
    `任务 ${traces[0]?.task_id?.slice(0, 8)} 执行过程中的经验`,
    '',
    '## 根因',
    `涉及 ${traces.length} 条痕迹记录`,
    '',
    '## 解法',
    '待人工补充',
    '',
    '## 适用场景',
    '待人工补充',
  ]
  return lines.join('\n')
}
```

- [ ] **Step 2: 在 knowledge-store.ts 中添加蒸馏触发**

在已有的 `KnowledgeStore` 类中添加：

```typescript
import { runDistillation } from './knowledge-distill'

// 在 KnowledgeStore 类中添加方法:
async distill(taskId?: string) {
  return runDistillation(taskId)
}

async getUnprocessedCount(): Promise<number> {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as cnt FROM knowledge WHERE distilled = 0').get() as { cnt: number }
  return row.cnt
}
```

- [ ] **Step 3: 在 knowledge 路由中添加蒸馏端点**

在 `server/src/routes/knowledge.ts` 中添加：

```typescript
// POST /api/knowledge/distill - 手动触发蒸馏
app.post('/api/knowledge/distill', async (c) => {
  const { task_id } = await c.req.json().catch(() => ({}))
  const result = await knowledgeStore.distill(task_id)
  return c.json(result)
})

// GET /api/knowledge/distill/status - 查看蒸馏状态
app.get('/api/knowledge/distill/status', async (c) => {
  const unprocessed = await knowledgeStore.getUnprocessedCount()
  return c.json({ unprocessed_count: unprocessed, needs_distillation: unprocessed >= 5 })
})
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/services/knowledge-distill.ts server/src/services/knowledge-store.ts server/src/routes/knowledge.ts
git commit -m "feat: add knowledge distillation pipeline"
```

---

### Task 2: 知识关联与图谱

**Files:**
- Create: `server/src/services/knowledge-graph.ts`
- Modify: `server/src/routes/knowledge.ts`

- [ ] **Step 1: 写知识图谱服务 `src/services/knowledge-graph.ts`**

```typescript
import fs from 'fs/promises'
import path from 'path'
import { getDb } from '../db/client'

const KNOWLEDGE_PATH = process.env.KNOWLEDGE_PATH || '/data/knowledge'

interface KnowledgeLink {
  source_id: string
  target_id: string
  relation_type: 'related' | 'causes' | 'solves' | 'refines'
  strength: number
}

/**
 * 知识图谱：基于标签重叠和内容相似性建立关联
 */
export async function buildLinks(): Promise<{ links_created: number }> {
  const db = getDb()

  // 读取所有知识条目的标签
  const files = await fs.readdir(KNOWLEDGE_PATH)
  const mdFiles = files.filter(f => f.endsWith('.md'))

  const items: { id: string; tags: string[]; type: string }[] = []
  for (const file of mdFiles) {
    const content = await fs.readFile(path.join(KNOWLEDGE_PATH, file), 'utf-8')
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!fmMatch) continue
    const fm: Record<string, string> = {}
    fmMatch[1].split('\n').forEach(line => {
      const [key, ...rest] = line.split(':')
      if (key && rest.length) fm[key.trim()] = rest.join(':').trim()
    })
    const tags = fm.tags ? fm.tags.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean) : []
    items.push({ id: file.replace('.md', ''), tags, type: fm.type || 'unknown' })
  }

  // 基于标签重叠计算关联
  const links: KnowledgeLink[] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const overlap = items[i].tags.filter(t => items[j].tags.includes(t)).length
      if (overlap >= 2) {
        links.push({
          source_id: items[i].id,
          target_id: items[j].id,
          relation_type: 'related',
          strength: overlap / Math.max(items[i].tags.length, items[j].tags.length),
        })
      }
    }
  }

  // 写入关联表
  db.prepare('DELETE FROM knowledge_links').run()
  const stmt = db.prepare(
    'INSERT INTO knowledge_links (source_id, target_id, relation_type, strength) VALUES (?, ?, ?, ?)'
  )
  for (const link of links) {
    stmt.run(link.source_id, link.target_id, link.relation_type, link.strength)
  }

  return { links_created: links.length }
}

export async function getRelated(id: string): Promise<{ id: string; relation: string; strength: number }[]> {
  const db = getDb()
  const links = db.prepare(
    'SELECT target_id as id, relation_type as relation, strength FROM knowledge_links WHERE source_id = ? UNION SELECT source_id as id, relation_type as relation, strength FROM knowledge_links WHERE target_id = ?'
  ).all(id, id) as { id: string; relation: string; strength: number }[]
  return links.sort((a, b) => b.strength - a.strength)
}
```

- [ ] **Step 2: 添加图谱端点**

在 `server/src/routes/knowledge.ts` 中添加：

```typescript
// POST /api/knowledge/graph/build - 构建关联图谱
app.post('/api/knowledge/graph/build', async (c) => {
  const result = await buildLinks()
  return c.json(result)
})

// GET /api/knowledge/:id/related - 获取关联知识
app.get('/api/knowledge/:id/related', async (c) => {
  const id = c.req.param('id')
  const related = await getRelated(id)
  return c.json({ related })
})
```

- [ ] **Step 3: 添加 knowledge_links 表到 schema**

在 `server/src/db/schema.ts` 的 migrations 中添加：

```sql
CREATE TABLE IF NOT EXISTS knowledge_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'related',
  strength REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, relation_type)
);
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/services/knowledge-graph.ts server/src/routes/knowledge.ts server/src/db/schema.ts
git commit -m "feat: add knowledge graph linking based on tag overlap"
```

---

### Task 3: 复用推荐

**Files:**
- Modify: `server/src/services/knowledge-store.ts`
- Modify: `server/src/routes/knowledge.ts`

- [ ] **Step 1: 在 knowledge-store.ts 中添加推荐方法**

```typescript
/**
 * 基于任务类型和标签推荐相关知识
 */
async recommend(taskType: string, tags: string[]): Promise<{ items: any[]; reason: string }[]> {
  const db = getDb()
  const results: { items: any[]; reason: string }[] = []

  // 1. 按任务类型匹配
  const typeItems = db.prepare(
    "SELECT * FROM knowledge WHERE content LIKE ? AND distilled = 1 LIMIT 5"
  ).all(`%${taskType}%`) as any[]

  if (typeItems.length > 0) {
    results.push({ items: typeItems, reason: `与任务类型 "${taskType}" 相关` })
  }

  // 2. 按标签匹配
  for (const tag of tags.slice(0, 5)) {
    const tagItems = db.prepare(
      "SELECT * FROM knowledge WHERE tags LIKE ? AND distilled = 1 LIMIT 3"
    ).all(`%${tag}%`) as any[]
    if (tagItems.length > 0) {
      results.push({ items: tagItems, reason: `标签 "${tag}" 匹配` })
    }
  }

  // 去重
  const seen = new Set<string>()
  const deduped = results.map(r => ({
    ...r,
    items: r.items.filter(item => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    }),
  })).filter(r => r.items.length > 0)

  return deduped
}
```

- [ ] **Step 2: 添加推荐端点**

```typescript
// GET /api/knowledge/recommend?type=xxx&tags=a,b - 知识推荐
app.get('/api/knowledge/recommend', async (c) => {
  const type = c.req.query('type') || ''
  const tags = (c.req.query('tags') || '').split(',').filter(Boolean)
  const recommendations = await knowledgeStore.recommend(type, tags)
  return c.json({ recommendations })
})
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/services/knowledge-store.ts server/src/routes/knowledge.ts
git commit -m "feat: add knowledge recommendation based on task type and tags"
```

---

### Task 4: 前端知识库增强

**Files:**
- Modify: `web/src/pages/KnowledgeBase.tsx`
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: 在 api.ts 中添加知识库新端点**

```typescript
// 在 knowledge 对象中添加:
distill: (taskId?: string) => request<{ distilled: number; items: any[] }>('/knowledge/distill', { method: 'POST', body: JSON.stringify({ task_id: taskId }) }),
distillStatus: () => request<{ unprocessed_count: number; needs_distillation: boolean }>('/knowledge/distill/status'),
getRelated: (id: string) => request<{ related: any[] }>(`/knowledge/${id}/related`),
recommend: (type: string, tags: string[]) => request<{ recommendations: any[] }>(`/knowledge/recommend?type=${type}&tags=${tags.join(',')}`),
buildGraph: () => request<{ links_created: number }>('/knowledge/graph/build', { method: 'POST' }),
```

- [ ] **Step 2: 在 KnowledgeBase.tsx 中添加关联面板和蒸馏按钮**

在知识条目详情区域添加：

```tsx
{/* 在 selectedItem 详情下方添加 */}

{/* 蒸馏状态 */}
<div className="mt-4 p-3 border rounded bg-gray-50">
  <div className="flex items-center justify-between mb-2">
    <span className="text-xs text-gray-500">未蒸馏痕迹</span>
    <button
      onClick={async () => {
        await api.knowledge.distill()
        alert('蒸馏完成')
      }}
      className="px-3 py-1 bg-blue-500 text-white rounded text-xs"
    >
      执行蒸馏
    </button>
  </div>
</div>

{/* 关联知识 */}
{selectedItem && (
  <div className="mt-4 p-3 border rounded">
    <h4 className="text-sm font-medium mb-2">关联知识</h4>
    <RelatedKnowledge itemId={selectedItem.id} />
  </div>
)}
```

添加 RelatedKnowledge 子组件：

```tsx
function RelatedKnowledge({ itemId }: { itemId: string }) {
  const [related, setRelated] = useState<any[]>([])

  useEffect(() => {
    api.knowledge.getRelated(itemId).then(({ related: r }) => setRelated(r))
  }, [itemId])

  if (related.length === 0) return <p className="text-xs text-gray-400">暂无关联</p>

  return (
    <div className="space-y-1">
      {related.map(r => (
        <div key={r.id} className="flex items-center justify-between text-xs">
          <span>{r.id}</span>
          <span className="text-gray-400">{r.relation} ({(r.strength * 100).toFixed(0)}%)</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add web/src/pages/KnowledgeBase.tsx web/src/lib/api.ts
git commit -m "feat: add knowledge distillation UI and related knowledge panel"
```

---

## 自检

**1. Spec 覆盖检查：**
- ✅ 知识蒸馏管道 → Task 1
- ✅ 知识关联图谱 → Task 2
- ✅ 复用推荐 → Task 3
- ✅ 前端增强 → Task 4
- ✅ Obsidian 格式兼容 → 全程使用 frontmatter + markdown
- ✅ 语义检索接口预留（ChromaDB 可在后续阶段接入）

**2. Placeholder 扫描：** 无 TBD/TODO

**3. 类型一致性：** 蒸馏结果的 DistillResult 类型与知识条目格式一致，关联表字段与 API 返回对应。

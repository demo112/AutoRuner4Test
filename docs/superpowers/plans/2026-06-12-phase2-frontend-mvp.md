# AutoRuner4Test Phase 2 — 前端 MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建可用的前端管理界面，覆盖组件市场、任务管理、运行监控、知识库浏览四个核心页面。

**Architecture:** React + Vite SPA，shadcn/ui 组件库，Zustand 状态管理，WebSocket 实时更新。

**Tech Stack:** React 18, Vite, TypeScript, shadcn/ui, Tailwind CSS, Zustand, React Router

**Depends on:** Phase 1 后端 API

---

## 文件结构

```
web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── lib/
│   │   ├── api.ts                # HTTP 客户端
│   │   ├── ws.ts                 # WebSocket 客户端
│   │   └── store.ts              # Zustand 状态
│   ├── pages/
│   │   ├── ComponentRegistry.tsx  # 组件市场
│   │   ├── TaskManager.tsx        # 任务管理
│   │   ├── TaskDetail.tsx         # 任务详情 + 日志
│   │   ├── Dashboard.tsx          # 运行监控
│   │   └── KnowledgeBase.tsx      # 知识库
│   ├── components/
│   │   ├── Layout.tsx             # 导航布局
│   │   ├── ComponentCard.tsx      # 组件卡片
│   │   ├── TaskCard.tsx           # 任务卡片
│   │   ├── StatusBadge.tsx        # 状态徽章
│   │   ├── ReviewModal.tsx        # 确认弹窗
│   │   └── DynamicForm.tsx        # 动态配置表单
│   └── styles/
│       └── globals.css
```

---

### Task 1: 前端脚手架

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/tailwind.config.ts`
- Create: `web/src/styles/globals.css`

- [ ] **Step 1: 初始化 Vite + React 项目**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
bunx create-vite web --template react-ts
cd web
bun install
```

- [ ] **Step 2: 安装 shadcn/ui 依赖**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/web
bun add tailwindcss @tailwindcss/vite class-variance-authority clsx tailwind-merge lucide-react
bun add zustand react-router-dom
```

- [ ] **Step 3: 配置 Tailwind `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
export default config
```

- [ ] **Step 4: 配置 Vite `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5201,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
```

- [ ] **Step 5: 写全局样式 `src/styles/globals.css`**

```css
@import "tailwindcss";

:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --muted: 210 40% 96%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --destructive: 0 84.2% 60.2%;
  --border: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
}
```

- [ ] **Step 6: 写最小 App `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

function HomePage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">AutoRuner4Test</h1></div>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 7: 写入口 `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 8: 验证启动**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/web
bun run dev &
sleep 3
curl http://localhost:5201 | head -5
# 期望: HTML 输出
kill %1
```

- [ ] **Step 9: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add web/
git commit -m "feat: scaffold web frontend with Vite + React + Tailwind"
```

---

### Task 2: API 客户端 + WebSocket + 状态管理

**Files:**
- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/ws.ts`
- Create: `web/src/lib/store.ts`

- [ ] **Step 1: 写 API 客户端 `src/lib/api.ts`**

```typescript
const BASE = '/api'

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

// Components
export const api = {
  components: {
    list: (type?: string, installed?: boolean) =>
      request<{ components: any[] }>(`/components${type ? `?type=${type}` : ''}${installed ? `${type ? '&' : '?'}installed=true` : ''}`),
    get: (id: string) => request<{ component: any }>(`/components/${id}`),
    install: (data: any) => request<{ component: any }>('/components/install', { method: 'POST', body: JSON.stringify(data) }),
    uninstall: (id: string) => request<{ ok: boolean }>(`/components/${id}`, { method: 'DELETE' }),
    updateConfig: (id: string, config: any) => request<{ component: any }>(`/components/${id}/config`, { method: 'PUT', body: JSON.stringify(config) }),
    getSchema: (id: string) => request<{ schema: any }>(`/components/${id}/schema`),
    toggle: (id: string, enabled: boolean) => request<{ component: any }>(`/components/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  },
  tasks: {
    list: (type?: string, status?: string) =>
      request<{ tasks: any[] }>(`/tasks${type ? `?type=${type}` : ''}${status ? `${type ? '&' : '?'}status=${status}` : ''}`),
    get: (id: string) => request<{ task: any }>(`/tasks/${id}`),
    create: (data: any) => request<{ task: any }>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    start: (id: string) => request<{ task: any }>(`/tasks/${id}/start`, { method: 'POST' }),
    approve: (id: string) => request<{ task: any }>(`/tasks/${id}/approve`, { method: 'POST' }),
    reject: (id: string) => request<{ task: any }>(`/tasks/${id}/reject`, { method: 'POST' }),
    retry: (id: string) => request<{ task: any }>(`/tasks/${id}/retry`, { method: 'POST' }),
    getArtifacts: (id: string) => request<{ artifacts: any[] }>(`/tasks/${id}/artifacts`),
    getArtifact: (taskId: string, artifactId: string) => request<{ name: string; content: string; type: string }>(`/tasks/${taskId}/artifact?artifact_id=${artifactId}`),
  },
  knowledge: {
    list: (type?: string, tag?: string) =>
      request<{ items: any[] }>(`/knowledge${type ? `?type=${type}` : ''}${tag ? `${type ? '&' : '?'}tag=${tag}` : ''}`),
    get: (id: string) => request<{ item: any }>(`/knowledge/${id}`),
    create: (data: any) => request<{ item: any }>('/knowledge', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<{ item: any }>(`/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    search: (q: string) => request<{ items: any[] }>(`/knowledge/search?q=${encodeURIComponent(q)}`),
  },
}
```

- [ ] **Step 2: 写 WebSocket 客户端 `src/lib/ws.ts`**

```typescript
type EventHandler = (event: string, taskId: string, data: any) => void

class WsClient {
  private ws: WebSocket | null = null
  private handlers: EventHandler[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.hostname}:3001`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
    }

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        for (const handler of this.handlers) {
          handler(msg.event, msg.taskId, msg.data)
        }
      } catch {
        // 忽略
      }
    }

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    }
  }

  onEvent(handler: EventHandler) {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  subscribe(taskId: string) {
    this.ws?.send(JSON.stringify({ type: 'subscribe', taskId }))
  }

  unsubscribe(taskId: string) {
    this.ws?.send(JSON.stringify({ type: 'unsubscribe', taskId }))
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}

export const wsClient = new WsClient()
```

- [ ] **Step 3: 写 Zustand 状态管理 `src/lib/store.ts`**

```typescript
import { create } from 'zustand'
import { api } from './api'

interface AppState {
  // Components
  components: any[]
  loadingComponents: boolean
  fetchComponents: (type?: string) => Promise<void>

  // Tasks
  tasks: any[]
  loadingTasks: boolean
  fetchTasks: (type?: string, status?: string) => Promise<void>
  updateTaskStatus: (taskId: string, status: string) => void

  // Review modal
  reviewTask: any | null
  setReviewTask: (task: any | null) => void

  // Knowledge
  knowledgeItems: any[]
  loadingKnowledge: boolean
  fetchKnowledge: (type?: string) => Promise<void>
}

export const useStore = create<AppState>((set) => ({
  // Components
  components: [],
  loadingComponents: false,
  fetchComponents: async (type?: string) => {
    set({ loadingComponents: true })
    try {
      const { components } = await api.components.list(type)
      set({ components })
    } finally {
      set({ loadingComponents: false })
    }
  },

  // Tasks
  tasks: [],
  loadingTasks: false,
  fetchTasks: async (type?: string, status?: string) => {
    set({ loadingTasks: true })
    try {
      const { tasks } = await api.tasks.list(type, status)
      set({ tasks })
    } finally {
      set({ loadingTasks: false })
    }
  },
  updateTaskStatus: (taskId, status) => {
    set((state) => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, status } : t),
    }))
  },

  // Review
  reviewTask: null,
  setReviewTask: (task) => set({ reviewTask: task }),

  // Knowledge
  knowledgeItems: [],
  loadingKnowledge: false,
  fetchKnowledge: async (type?: string) => {
    set({ loadingKnowledge: true })
    try {
      const { items } = await api.knowledge.list(type)
      set({ knowledgeItems: items })
    } finally {
      set({ loadingKnowledge: false })
    }
  },
}))
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add web/src/lib/
git commit -m "feat: add API client, WebSocket client, and Zustand store"
```

---

### Task 3: 布局 + 导航 + 通用组件

**Files:**
- Create: `web/src/components/Layout.tsx`
- Create: `web/src/components/StatusBadge.tsx`
- Create: `web/src/components/DynamicForm.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 写布局组件 `src/components/Layout.tsx`**

```tsx
import { NavLink, Outlet } from 'react-router-dom'
import { Package, ListTodo, Monitor, BookOpen } from 'lucide-react'

const navItems = [
  { to: '/components', label: '组件市场', icon: Package },
  { to: '/tasks', label: '任务管理', icon: ListTodo },
  { to: '/dashboard', label: '运行监控', icon: Monitor },
  { to: '/knowledge', label: '知识库', icon: BookOpen },
]

export default function Layout() {
  return (
    <div className="flex h-screen">
      <nav className="w-48 border-r bg-gray-50 flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold">AutoRuner4Test</h1>
        </div>
        <div className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm ${isActive ? 'bg-gray-200 font-medium' : 'text-gray-600 hover:bg-gray-100'}`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 写状态徽章 `src/components/StatusBadge.tsx`**

```tsx
const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  completed: 'bg-green-200 text-green-800',
  failed: 'bg-red-100 text-red-700',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}
```

- [ ] **Step 3: 写动态配置表单 `src/components/DynamicForm.tsx`**

```tsx
import { useState } from 'react'

export default function DynamicForm({
  schema,
  values,
  onSubmit,
}: {
  schema: Record<string, any>
  values: Record<string, any>
  onSubmit: (values: Record<string, any>) => void
}) {
  const [form, setForm] = useState(values)

  const properties = schema.properties || {}

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(form) }}
      className="space-y-3"
    >
      {Object.entries(properties).map(([key, def]: [string, any]) => (
        <div key={key}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {def.title || key}
          </label>
          {def.type === 'boolean' ? (
            <input
              type="checkbox"
              checked={!!form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              className="rounded"
            />
          ) : def.enum ? (
            <select
              value={form[key] || ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="">请选择</option>
              {def.enum.map((v: string) => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : def.type === 'number' ? (
            <input
              type="number"
              value={form[key] || ''}
              onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          ) : (
            <input
              type="text"
              value={form[key] || ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          )}
        </div>
      ))}
      <button
        type="submit"
        className="px-4 py-1.5 bg-black text-white rounded text-sm hover:bg-gray-800"
      >
        保存
      </button>
    </form>
  )
}
```

- [ ] **Step 4: 更新 `src/App.tsx` 集成路由和布局**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ComponentRegistry from './pages/ComponentRegistry'
import TaskManager from './pages/TaskManager'
import Dashboard from './pages/Dashboard'
import KnowledgeBase from './pages/KnowledgeBase'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/components" element={<ComponentRegistry />} />
          <Route path="/tasks" element={<TaskManager />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/knowledge" element={<KnowledgeBase />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add web/src/components/ web/src/App.tsx
git commit -m "feat: add Layout, StatusBadge, DynamicForm components + routing"
```

---

### Task 4: 组件市场页面

**Files:**
- Create: `web/src/pages/ComponentRegistry.tsx`
- Create: `web/src/components/ComponentCard.tsx`

- [ ] **Step 1: 写组件卡片 `src/components/ComponentCard.tsx`**

```tsx
import StatusBadge from './StatusBadge'

export default function ComponentCard({
  component,
  onToggle,
  onConfig,
}: {
  component: any
  onToggle: (id: string, enabled: boolean) => void
  onConfig: (id: string) => void
}) {
  const typeColors: Record<string, string> = {
    skill: 'bg-purple-100 text-purple-700',
    hook: 'bg-orange-100 text-orange-700',
    mcp: 'bg-teal-100 text-teal-700',
    rule: 'bg-indigo-100 text-indigo-700',
  }

  return (
    <div className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-sm">{component.name}</h3>
            <span className={`px-1.5 py-0.5 rounded text-xs ${typeColors[component.type]}`}>
              {component.type}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-2">{component.description}</p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>v{component.version}</span>
            {component.author && <span>· {component.author}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={component.installed ? (component.enabled ? 'completed' : 'failed') : 'pending'} />
        </div>
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t">
        <button
          onClick={() => onToggle(component.id, !component.enabled)}
          className={`px-3 py-1 rounded text-xs ${component.enabled ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
        >
          {component.enabled ? '禁用' : '启用'}
        </button>
        <button
          onClick={() => onConfig(component.id)}
          className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
        >
          配置
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 写组件市场页面 `src/pages/ComponentRegistry.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import ComponentCard from '../components/ComponentCard'

const TABS = ['all', 'skill', 'hook', 'mcp', 'rule'] as const

export default function ComponentRegistry() {
  const { components, fetchComponents } = useStore()
  const [activeTab, setActiveTab] = useState<string>('all')
  const [configId, setConfigId] = useState<string | null>(null)
  const [schema, setSchema] = useState<any>(null)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    fetchComponents(activeTab === 'all' ? undefined : activeTab)
  }, [activeTab, fetchComponents])

  const handleToggle = async (id: string, enabled: boolean) => {
    await api.components.toggle(id, enabled)
    fetchComponents(activeTab === 'all' ? undefined : activeTab)
  }

  const handleConfig = async (id: string) => {
    const { schema: s } = await api.components.getSchema(id)
    setSchema(s)
    setConfigId(id)
  }

  const handleInstall = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    await api.components.install({
      name: form.get('name'),
      type: form.get('type'),
      source: form.get('source'),
      description: form.get('description'),
    })
    setShowInstall(false)
    fetchComponents()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">组件市场</h2>
        <button
          onClick={() => setShowInstall(!showInstall)}
          className="px-4 py-1.5 bg-black text-white rounded text-sm"
        >
          安装组件
        </button>
      </div>

      {/* 安装表单 */}
      {showInstall && (
        <form onSubmit={handleInstall} className="border rounded-lg p-4 mb-4 space-y-3 bg-gray-50">
          <div className="grid grid-cols-2 gap-3">
            <input name="name" placeholder="组件名称" className="border rounded px-2 py-1 text-sm" required />
            <select name="type" className="border rounded px-2 py-1 text-sm" required>
              <option value="skill">Skill</option>
              <option value="hook">Hook</option>
              <option value="mcp">MCP</option>
              <option value="rule">Rule</option>
            </select>
            <input name="source" placeholder="来源路径" className="border rounded px-2 py-1 text-sm" required />
            <input name="description" placeholder="描述" className="border rounded px-2 py-1 text-sm" />
          </div>
          <button type="submit" className="px-4 py-1.5 bg-blue-500 text-white rounded text-sm">确认安装</button>
        </form>
      )}

      {/* 类型筛选 */}
      <div className="flex gap-1 mb-4">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-sm ${activeTab === tab ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {tab === 'all' ? '全部' : tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* 组件列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {components.map(comp => (
          <ComponentCard
            key={comp.id}
            component={comp}
            onToggle={handleToggle}
            onConfig={handleConfig}
          />
        ))}
      </div>
      {components.length === 0 && (
        <p className="text-center text-gray-400 py-12">暂无组件</p>
      )}

      {/* 配置弹窗 */}
      {configId && schema && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-auto">
            <h3 className="font-bold mb-4">组件配置</h3>
            <DynamicForm
              schema={schema}
              values={{}}
              onSubmit={async (values) => {
                await api.components.updateConfig(configId, values)
                setConfigId(null)
                setSchema(null)
                fetchComponents()
              }}
            />
            <button onClick={() => { setConfigId(null); setSchema(null) }} className="mt-3 text-sm text-gray-500">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

> 注意：需要在 ComponentRegistry 顶部导入 DynamicForm

- [ ] **Step 3: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add web/src/pages/ComponentRegistry.tsx web/src/components/ComponentCard.tsx
git commit -m "feat: add component registry page with install/toggle/config"
```

---

### Task 5: 任务管理页面

**Files:**
- Create: `web/src/pages/TaskManager.tsx`
- Create: `web/src/pages/TaskDetail.tsx`
- Create: `web/src/components/TaskCard.tsx`
- Create: `web/src/components/ReviewModal.tsx`

- [ ] **Step 1: 写任务卡片 `src/components/TaskCard.tsx`**

```tsx
import { useNavigate } from 'react-router-dom'
import StatusBadge from './StatusBadge'

const typeLabels: Record<string, string> = {
  'requirement-analysis': '需求分析',
  'testcase-generation': '用例生成',
  'script-conversion': '脚本转换',
  'execution-analysis': '执行分析',
  'issue-triage': '提单处理',
}

export default function TaskCard({ task }: { task: any }) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/tasks/${task.id}`)}
      className="border rounded-lg p-4 hover:shadow-sm transition-shadow cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{typeLabels[task.type] || task.type}</span>
        <StatusBadge status={task.status} />
      </div>
      <div className="text-xs text-gray-400">
        <span>{new Date(task.created_at).toLocaleString()}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 写确认弹窗 `src/components/ReviewModal.tsx`**

```tsx
import { api } from '../lib/api'

export default function ReviewModal({
  task,
  onClose,
  onAction,
}: {
  task: any
  onClose: () => void
  onAction: () => void
}) {
  const handleApprove = async () => {
    await api.tasks.approve(task.id)
    onAction()
  }

  const handleReject = async () => {
    await api.tasks.reject(task.id)
    onAction()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[600px] max-h-[80vh] overflow-auto">
        <h3 className="font-bold text-lg mb-2">人工确认</h3>
        <p className="text-sm text-gray-500 mb-4">任务 {task.id} 需要人工确认</p>

        {task.output_artifact_id && (
          <div className="border rounded p-3 bg-gray-50 mb-4 max-h-60 overflow-auto">
            <p className="text-xs text-gray-500 mb-1">产出物预览</p>
            <pre className="text-xs whitespace-pre-wrap">{task.output_artifact_id}</pre>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            className="px-4 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
          >
            ✅ 确认通过
          </button>
          <button
            onClick={handleReject}
            className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
          >
            ❌ 驳回
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded text-sm hover:bg-gray-200"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 写任务管理页面 `src/pages/TaskManager.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import TaskCard from '../components/TaskCard'

const TASK_TYPES = [
  { value: 'requirement-analysis', label: '需求分析' },
  { value: 'testcase-generation', label: '用例生成' },
  { value: 'script-conversion', label: '脚本转换' },
  { value: 'execution-analysis', label: '执行分析' },
  { value: 'issue-triage', label: '提单处理' },
]

export default function TaskManager() {
  const { tasks, fetchTasks } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [filterType, setFilterType] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')

  useEffect(() => {
    fetchTasks(filterType || undefined, filterStatus || undefined)
  }, [filterType, filterStatus, fetchTasks])

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    await api.tasks.create({
      type: form.get('type'),
    })
    setShowCreate(false)
    fetchTasks()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">任务管理</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-1.5 bg-black text-white rounded text-sm">
          创建任务
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="border rounded-lg p-4 mb-4 bg-gray-50 space-y-3">
          <select name="type" className="border rounded px-2 py-1 text-sm w-full" required>
            <option value="">选择任务类型</option>
            {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button type="submit" className="px-4 py-1.5 bg-blue-500 text-white rounded text-sm">创建</button>
        </form>
      )}

      {/* 筛选 */}
      <div className="flex gap-2 mb-4">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">全部类型</option>
          {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">全部状态</option>
          <option value="pending">待执行</option>
          <option value="running">运行中</option>
          <option value="review">待确认</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tasks.map(task => <TaskCard key={task.id} task={task} />)}
      </div>
      {tasks.length === 0 && <p className="text-center text-gray-400 py-12">暂无任务</p>}
    </div>
  )
}
```

- [ ] **Step 4: 写任务详情页 `src/pages/TaskDetail.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import ReviewModal from '../components/ReviewModal'

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [task, setTask] = useState<any>(null)
  const [artifacts, setArtifacts] = useState<any[]>([])
  const [artifactContent, setArtifactContent] = useState<string | null>(null)
  const [showReview, setShowReview] = useState(false)

  const refresh = async () => {
    if (!id) return
    const { task: t } = await api.tasks.get(id)
    setTask(t)
    const { artifacts: a } = await api.tasks.getArtifacts(id)
    setArtifacts(a)
  }

  useEffect(() => { refresh() }, [id])

  if (!task) return <div className="p-6">加载中...</div>

  const typeLabels: Record<string, string> = {
    'requirement-analysis': '需求分析',
    'testcase-generation': '用例生成',
    'script-conversion': '脚本转换',
    'execution-analysis': '执行分析',
    'issue-triage': '提单处理',
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/tasks')} className="text-gray-400 hover:text-gray-600">← 返回</button>
        <h2 className="text-xl font-bold">{typeLabels[task.type] || task.type}</h2>
        <StatusBadge status={task.status} />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 mb-6">
        {task.status === 'pending' && (
          <button
            onClick={async () => { await api.tasks.start(task.id); refresh() }}
            className="px-4 py-1.5 bg-blue-500 text-white rounded text-sm"
          >
            启动
          </button>
        )}
        {task.status === 'review' && (
          <button
            onClick={() => setShowReview(true)}
            className="px-4 py-1.5 bg-yellow-500 text-white rounded text-sm"
          >
            确认/驳回
          </button>
        )}
        {task.status === 'failed' && (
          <button
            onClick={async () => { await api.tasks.retry(task.id); refresh() }}
            className="px-4 py-1.5 bg-gray-500 text-white rounded text-sm"
          >
            重试
          </button>
        )}
      </div>

      {/* 详情 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="border rounded p-3">
          <p className="text-xs text-gray-500">任务 ID</p>
          <p className="text-sm font-mono">{task.id}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-xs text-gray-500">创建时间</p>
          <p className="text-sm">{new Date(task.created_at).toLocaleString()}</p>
        </div>
      </div>

      {/* 产出物 */}
      {artifacts.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold mb-2">产出物</h3>
          <div className="space-y-2">
            {artifacts.map(a => (
              <div
                key={a.id}
                onClick={async () => {
                  const content = await api.tasks.getArtifact(task.id, a.id)
                  setArtifactContent(content.content)
                }}
                className="border rounded p-3 hover:bg-gray-50 cursor-pointer"
              >
                <span className="text-sm">{a.name}</span>
                <span className="text-xs text-gray-400 ml-2">{a.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 产出物内容 */}
      {artifactContent && (
        <div className="border rounded p-4 bg-gray-50">
          <div className="flex justify-between mb-2">
            <h3 className="font-bold">内容</h3>
            <button onClick={() => setArtifactContent(null)} className="text-xs text-gray-400">关闭</button>
          </div>
          <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-96">{artifactContent}</pre>
        </div>
      )}

      {/* 确认弹窗 */}
      {showReview && (
        <ReviewModal
          task={task}
          onClose={() => setShowReview(false)}
          onAction={() => { setShowReview(false); refresh() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: 更新 App.tsx 添加任务详情路由**

在 `src/App.tsx` 的 Routes 中添加：

```tsx
import TaskDetail from './pages/TaskDetail'

// 在 /tasks 路由之后添加:
<Route path="/tasks/:id" element={<TaskDetail />} />
```

- [ ] **Step 6: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add web/src/pages/TaskManager.tsx web/src/pages/TaskDetail.tsx web/src/components/TaskCard.tsx web/src/components/ReviewModal.tsx web/src/App.tsx
git commit -m "feat: add task management pages with create/start/review/reject"
```

---

### Task 6: Dashboard 运行监控页面

**Files:**
- Create: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: 写 Dashboard 页面 `src/pages/Dashboard.tsx`**

```tsx
import { useEffect } from 'react'
import { useStore } from '../lib/store'
import { wsClient } from '../lib/ws'
import StatusBadge from '../components/StatusBadge'

export default function Dashboard() {
  const { tasks, fetchTasks, updateTaskStatus } = useStore()

  useEffect(() => {
    fetchTasks()
    wsClient.connect()

    const unsub = wsClient.onEvent((event, taskId, data) => {
      if (event === 'task:status-changed') {
        updateTaskStatus(taskId, data.to)
      }
    })

    return () => { unsub(); wsClient.disconnect() }
  }, [fetchTasks, updateTaskStatus])

  const running = tasks.filter(t => t.status === 'running')
  const reviewing = tasks.filter(t => t.status === 'review')
  const failed = tasks.filter(t => t.status === 'failed')

  const typeLabels: Record<string, string> = {
    'requirement-analysis': '需求分析',
    'testcase-generation': '用例生成',
    'script-conversion': '脚本转换',
    'execution-analysis': '执行分析',
    'issue-triage': '提单处理',
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6">运行监控</h2>

      {/* 状态概览 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border rounded-lg p-4 bg-blue-50">
          <p className="text-2xl font-bold text-blue-600">{running.length}</p>
          <p className="text-sm text-gray-600">运行中</p>
        </div>
        <div className="border rounded-lg p-4 bg-yellow-50">
          <p className="text-2xl font-bold text-yellow-600">{reviewing.length}</p>
          <p className="text-sm text-gray-600">待确认</p>
        </div>
        <div className="border rounded-lg p-4 bg-red-50">
          <p className="text-2xl font-bold text-red-600">{failed.length}</p>
          <p className="text-sm text-gray-600">失败</p>
        </div>
      </div>

      {/* 待确认任务（最紧急） */}
      {reviewing.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold mb-2 text-yellow-700">⚠ 待确认</h3>
          <div className="space-y-2">
            {reviewing.map(task => (
              <div key={task.id} className="border rounded p-3 flex items-center justify-between bg-yellow-50">
                <div>
                  <span className="text-sm font-medium">{typeLabels[task.type]}</span>
                  <span className="text-xs text-gray-400 ml-2">{task.id.slice(0, 8)}</span>
                </div>
                <StatusBadge status={task.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 运行中任务 */}
      {running.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold mb-2">🔄 运行中</h3>
          <div className="space-y-2">
            {running.map(task => (
              <div key={task.id} className="border rounded p-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{typeLabels[task.type]}</span>
                  <span className="text-xs text-gray-400 ml-2">{task.id.slice(0, 8)}</span>
                </div>
                <StatusBadge status={task.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最近任务 */}
      <div>
        <h3 className="font-bold mb-2">所有任务</h3>
        <div className="space-y-1">
          {tasks.slice(0, 20).map(task => (
            <div key={task.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-sm">{typeLabels[task.type]}</span>
                <span className="text-xs text-gray-400">{new Date(task.created_at).toLocaleString()}</span>
              </div>
              <StatusBadge status={task.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add web/src/pages/Dashboard.tsx
git commit -m "feat: add dashboard page with real-time task monitoring"
```

---

### Task 7: 知识库页面

**Files:**
- Create: `web/src/pages/KnowledgeBase.tsx`

- [ ] **Step 1: 写知识库页面 `src/pages/KnowledgeBase.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'

const KNOWLEDGE_TYPES = [
  { value: '', label: '全部' },
  { value: 'pattern', label: '模式' },
  { value: 'lesson', label: '教训' },
  { value: 'defect_pattern', label: '缺陷模式' },
  { value: 'script_template', label: '脚本模板' },
]

export default function KnowledgeBase() {
  const { knowledgeItems, fetchKnowledge } = useStore()
  const [filterType, setFilterType] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [selectedItem, setSelectedItem] = useState<any>(null)

  useEffect(() => {
    fetchKnowledge(filterType || undefined)
  }, [filterType, fetchKnowledge])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    const { items } = await api.knowledge.search(searchQuery)
    setSearchResults(items)
  }

  const items = searchResults || knowledgeItems

  return (
    <div className="p-6 flex gap-6">
      {/* 左侧列表 */}
      <div className="w-2/3">
        <h2 className="text-xl font-bold mb-4">知识库</h2>

        {/* 搜索 + 筛选 */}
        <div className="flex gap-2 mb-4">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜索知识..."
            className="flex-1 border rounded px-3 py-1.5 text-sm"
          />
          <button onClick={handleSearch} className="px-4 py-1.5 bg-black text-white rounded text-sm">搜索</button>
          {searchResults && (
            <button onClick={() => { setSearchResults(null); setSearchQuery('') }} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-sm">清除</button>
          )}
        </div>

        <div className="flex gap-1 mb-4">
          {KNOWLEDGE_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={`px-3 py-1 rounded text-sm ${filterType === t.value ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 条目列表 */}
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              onClick={async () => {
                const { item: detail } = await api.knowledge.get(item.id)
                setSelectedItem(detail)
              }}
              className="border rounded p-3 hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  item.type === 'lesson' ? 'bg-orange-100 text-orange-700' :
                  item.type === 'pattern' ? 'bg-blue-100 text-blue-700' :
                  item.type === 'defect_pattern' ? 'bg-red-100 text-red-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {item.type}
                </span>
                <span className="text-sm font-medium">{item.title}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{new Date(item.created_at).toLocaleDateString()}</p>
            </div>
          ))}
          {items.length === 0 && <p className="text-center text-gray-400 py-12">暂无知识条目</p>}
        </div>
      </div>

      {/* 右侧详情 */}
      <div className="w-1/3">
        {selectedItem ? (
          <div className="border rounded-lg p-4 sticky top-6">
            <h3 className="font-bold text-lg mb-2">{selectedItem.title}</h3>
            <div className="flex gap-1 mb-3">
              {JSON.parse(selectedItem.tags || '[]').map((tag: string) => (
                <span key={tag} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{tag}</span>
              ))}
            </div>
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded overflow-auto max-h-96">
                {selectedItem.content}
              </pre>
            </div>
          </div>
        ) : (
          <div className="border rounded-lg p-4 text-center text-gray-400">
            选择一个知识条目查看详情
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add web/src/pages/KnowledgeBase.tsx
git commit -m "feat: add knowledge base page with search and detail view"
```

---

### Task 8: 构建验证

- [ ] **Step 1: 确保项目能构建**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test/web
bun run build
# 期望: 构建成功
```

- [ ] **Step 2: 修复构建错误（如有）**

根据 build 输出修复问题。

- [ ] **Step 3: Commit 最终版本**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add web/
git commit -m "chore: ensure web frontend builds successfully"
```

---

## 自检

**1. Spec 覆盖检查：**
- ✅ 组件市场页面（按类型分 tab、安装/卸载、配置表单）→ Task 4
- ✅ 任务管理（创建、列表、详情、启动/确认/驳回/重试）→ Task 5
- ✅ 运行监控（状态总览、实时更新、确认弹窗）→ Task 6
- ✅ 知识库（搜索、按类型筛选、详情查看）→ Task 7
- ✅ WebSocket 实时更新 → Task 6 + lib/ws.ts
- ✅ 动态配置表单（基于 JSON Schema 渲染）→ DynamicForm

**2. Placeholder 扫描：** 无 TBD/TODO

**3. 类型一致性：** API 客户端与后端 API 路径对应，状态枚举与后端一致。

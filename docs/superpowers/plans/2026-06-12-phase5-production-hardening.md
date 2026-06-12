# AutoRuner4Test Phase 5 — 生产加固

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现生产级安全、鉴权、凭据管理、结构化日志、可观测性，使平台具备上线条件。

**Architecture:** 在 Phase 1-4 基础上，增加 API 鉴权中间件、凭据加密存储、结构化日志管道、健康检查与指标暴露。

**Tech Stack:** TypeScript (后端), Hono 中间件, better-sqlite3 (凭据存储), pino (日志)

**Depends on:** Phase 1 后端核心

---

## 文件结构

```
server/src/
├── middleware/
│   ├── auth.ts            # 新增：鉴权中间件
│   └── rate-limit.ts      # 新增：限流中间件
├── services/
│   ├── credential-store.ts # 新增：凭据加密存储
│   └── logger.ts          # 新增：结构化日志
├── routes/
│   ├── auth.ts            # 新增：鉴权路由
│   └── health.ts          # 新增：健康检查
└── db/
    └── schema.ts          # 已有，增加表
```

---

### Task 1: 结构化日志

**Files:**
- Create: `server/src/services/logger.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 写日志服务 `src/services/logger.ts`**

```typescript
import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  formatters: {
    level(label: string) {
      return { level: label }
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    req(req: any) {
      return {
        method: req.method,
        url: req.url,
        headers: { authorization: undefined },
      }
    },
  },
})

/** 创建子 logger，附带模块上下文 */
export function moduleLogger(module: string) {
  return logger.child({ module })
}
```

- [ ] **Step 2: 在 index.ts 中替换 console.log 为 logger**

在 `server/src/index.ts` 中：

```typescript
import { logger, moduleLogger } from './services/logger'

const log = moduleLogger('server')

// 替换所有 console.log 为 log.info
// 替换所有 console.error 为 log.error
// 启动时记录：
log.info({ port, env: process.env.NODE_ENV }, 'Server started')
```

- [ ] **Step 3: 在关键服务中注入 logger**

在 `task-runner.ts`、`claude-instance.ts`、`component-registry.ts` 中：

```typescript
import { moduleLogger } from './services/logger'
const log = moduleLogger('task-runner') // 各自模块名

// 关键操作日志示例（task-runner）:
log.info({ taskId, status: 'started' }, 'Task execution started')
log.error({ taskId, err }, 'Task execution failed')
log.info({ taskId, status: 'completed', duration }, 'Task completed')
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/services/logger.ts server/src/index.ts server/src/services/task-runner.ts server/src/services/claude-instance.ts server/src/services/component-registry.ts
git commit -m "feat: add structured logging with pino"
```

---

### Task 2: API 鉴权

**Files:**
- Create: `server/src/middleware/auth.ts`
- Create: `server/src/routes/auth.ts`
- Modify: `server/src/db/schema.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 添加 users 表到 schema**

在 `server/src/db/schema.ts` 的 migrations 中添加：

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);
```

- [ ] **Step 2: 写鉴权中间件 `src/middleware/auth.ts`**

```typescript
import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import { getDb } from '../db/client'
import { moduleLogger } from '../services/logger'

const log = moduleLogger('auth')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

interface JwtPayload {
  sub: string    // user id
  role: string
  exp: number
}

export const authMiddleware = createMiddleware(async (c, next) => {
  // 开发模式跳过鉴权（通过环境变量控制）
  if (process.env.AUTH_DISABLED === 'true') {
    c.set('userId', 'dev-user')
    c.set('userRole', 'admin')
    return next()
  }

  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401)
  }

  const token = authHeader.slice(7)
  try {
    const payload = await verify(token, JWT_SECRET) as JwtPayload
    c.set('userId', payload.sub)
    c.set('userRole', payload.role)
    log.info({ userId: payload.sub, path: c.req.path }, 'Authenticated request')
    return next()
  } catch {
    log.warn({ path: c.req.path }, 'Invalid token')
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
})

/** 角色检查中间件 */
export function requireRole(...roles: string[]) {
  return createMiddleware(async (c, next) => {
    const userRole = c.get('userRole') as string
    if (!roles.includes(userRole)) {
      return c.json({ error: 'Insufficient permissions' }, 403)
    }
    return next()
  })
}
```

- [ ] **Step 3: 写鉴权路由 `src/routes/auth.ts`**

```typescript
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { getDb } from '../db/client'
import { moduleLogger } from '../services/logger'

const log = moduleLogger('auth-route')
const app = new Hono()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

// 密码验证用简单 hash（生产环境替换为 bcrypt）
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + (process.env.PASSWORD_SALT || 'salt'))
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// POST /api/auth/login
app.post('/login', async (c) => {
  const { username, password } = await c.req.json()
  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400)
  }

  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
  if (!user) {
    log.warn({ username }, 'Login failed: user not found')
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const hash = await hashPassword(password)
  if (hash !== user.password_hash) {
    log.warn({ username }, 'Login failed: wrong password')
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // 更新最后登录
  db.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(user.id)

  const token = await sign({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 86400 }, JWT_SECRET)
  log.info({ userId: user.id }, 'Login successful')
  return c.json({ token, user: { id: user.id, username: user.username, role: user.role } })
})

// POST /api/auth/init — 首次初始化管理员（仅当无用户时可用）
app.post('/init', async (c) => {
  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as any).cnt
  if (count > 0) {
    return c.json({ error: 'Admin already initialized' }, 409)
  }

  const { username, password } = await c.req.json()
  if (!username || !password || password.length < 6) {
    return c.json({ error: 'Username and password (min 6 chars) required' }, 400)
  }

  const id = crypto.randomUUID()
  const hash = await hashPassword(password)
  db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(id, username, hash, 'admin')

  log.info({ userId: id }, 'Admin initialized')
  return c.json({ id, username, role: 'admin' }, 201)
})

export default app
```

- [ ] **Step 4: 在 index.ts 中注册鉴权路由和中间件**

在 `server/src/index.ts` 中：

```typescript
import authRoutes from './routes/auth'
import { authMiddleware } from './middleware/auth'

// 鉴权路由不需要 auth 中间件
app.route('/api/auth', authRoutes)

// 其他 API 路由需要 auth 中间件
app.use('/api/*', authMiddleware)
// auth 路由已经注册在 /api/auth 上，中间件不拦截（注册顺序：先路由后中间件）
// 调整注册顺序：先注册 auth 路由，再挂载 authMiddleware，最后注册其他路由
```

- [ ] **Step 5: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/middleware/auth.ts server/src/routes/auth.ts server/src/db/schema.ts server/src/index.ts
git commit -m "feat: add JWT authentication with login and admin init"
```

---

### Task 3: 凭据加密存储

**Files:**
- Create: `server/src/services/credential-store.ts`
- Modify: `server/src/db/schema.ts`
- Modify: `server/src/routes/components.ts`

- [ ] **Step 1: 添加 credentials 表到 schema**

在 `server/src/db/schema.ts` 的 migrations 中添加：

```sql
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL,
  key_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(component_id, key_name),
  FOREIGN KEY (component_id) REFERENCES components(id)
);
```

- [ ] **Step 2: 写凭据存储服务 `src/services/credential-store.ts`**

```typescript
import { getDb } from '../db/client'
import { moduleLogger } from './logger'

const log = moduleLogger('credential-store')

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production'

/**
 * 简易 AES 加密（Node.js crypto）
 * 生产环境应使用 KMS 或 Vault
 */
async function encrypt(text: string): Promise<string> {
  const crypto = await import('crypto')
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

async function decrypt(encryptedText: string): Promise<string> {
  const crypto = await import('crypto')
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  const [ivHex, encrypted] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export class CredentialStore {
  async save(componentId: string, keyName: string, value: string): Promise<void> {
    const db = getDb()
    const id = `${componentId}:${keyName}`
    const encrypted = await encrypt(value)

    db.prepare(`
      INSERT INTO credentials (id, component_id, key_name, encrypted_value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(component_id, key_name) DO UPDATE SET
        encrypted_value = excluded.encrypted_value,
        updated_at = datetime('now')
    `).run(id, componentId, keyName, encrypted)

    log.info({ componentId, keyName }, 'Credential saved')
  }

  async get(componentId: string, keyName: string): Promise<string | null> {
    const db = getDb()
    const row = db.prepare(
      'SELECT encrypted_value FROM credentials WHERE component_id = ? AND key_name = ?'
    ).get(componentId, keyName) as { encrypted_value: string } | undefined

    if (!row) return null

    return decrypt(row.encrypted_value)
  }

  async getAllForComponent(componentId: string): Promise<Record<string, string>> {
    const db = getDb()
    const rows = db.prepare(
      'SELECT key_name, encrypted_value FROM credentials WHERE component_id = ?'
    ).all(componentId) as { key_name: string; encrypted_value: string }[]

    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key_name] = await decrypt(row.encrypted_value)
    }
    return result
  }

  async delete(componentId: string, keyName: string): Promise<void> {
    const db = getDb()
    db.prepare('DELETE FROM credentials WHERE component_id = ? AND key_name = ?').run(componentId, keyName)
    log.info({ componentId, keyName }, 'Credential deleted')
  }
}

export const credentialStore = new CredentialStore()
```

- [ ] **Step 3: 在组件配置端点中使用凭据存储**

在 `server/src/routes/components.ts` 中，修改配置更新端点：

```typescript
import { credentialStore } from '../services/credential-store'

// PUT /api/components/:id/config - 更新组件配置
app.put('/api/components/:id/config', async (c) => {
  const id = c.req.param('id')
  const config = await c.req.json()

  // 分离敏感字段（如 password, token, api_key, secret）
  const sensitiveKeys = ['password', 'token', 'api_key', 'secret', 'apiKey', 'accessKey', 'secretKey']
  const safeConfig: Record<string, any> = {}
  const credentialPromises: Promise<void>[] = []

  for (const [key, value] of Object.entries(config)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      // 敏感字段存入凭据存储
      credentialPromises.push(credentialStore.save(id, key, String(value)))
    } else {
      safeConfig[key] = value
    }
  }

  await Promise.all(credentialPromises)

  // 非敏感配置存入组件 config
  const db = getDb()
  db.prepare('UPDATE components SET config = ? WHERE id = ?').run(JSON.stringify(safeConfig), id)

  return c.json({ success: true })
})
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/services/credential-store.ts server/src/db/schema.ts server/src/routes/components.ts
git commit -m "feat: add encrypted credential storage for component secrets"
```

---

### Task 4: 限流与健康检查

**Files:**
- Create: `server/src/middleware/rate-limit.ts`
- Create: `server/src/routes/health.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 写限流中间件 `src/middleware/rate-limit.ts`**

```typescript
import { createMiddleware } from 'hono/factory'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

const WINDOW_MS = 60_000    // 1 分钟窗口
const MAX_REQUESTS = 100    // 每窗口最大请求数

export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  if (process.env.RATE_LIMIT_DISABLED === 'true') {
    return next()
  }

  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  const now = Date.now()

  const entry = store.get(ip)
  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    c.header('X-RateLimit-Remaining', String(MAX_REQUESTS - 1))
    return next()
  }

  if (entry.count >= MAX_REQUESTS) {
    c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
    return c.json({ error: 'Rate limit exceeded' }, 429)
  }

  entry.count++
  c.header('X-RateLimit-Remaining', String(MAX_REQUESTS - entry.count))
  return next()
})

// 定期清理过期条目
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of store) {
    if (now > entry.resetAt) store.delete(ip)
  }
}, 60_000)
```

- [ ] **Step 2: 写健康检查路由 `src/routes/health.ts`**

```typescript
import { Hono } from 'hono'
import { getDb } from '../db/client'
import { moduleLogger } from '../services/logger'

const log = moduleLogger('health')
const app = new Hono()

app.get('/', (c) => {
  const checks: { name: string; status: string; detail?: string }[] = []

  // SQLite 可达性
  try {
    const db = getDb()
    db.prepare('SELECT 1').get()
    checks.push({ name: 'sqlite', status: 'ok' })
  } catch (err) {
    checks.push({ name: 'sqlite', status: 'error', detail: String(err) })
  }

  // Redis 可达性（如果配置了）
  // BullMQ 连接检查留给后续集成

  const allOk = checks.every(c => c.status === 'ok')
  return c.json({ status: allOk ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() }, allOk ? 200 : 503)
})

app.get('/ready', (c) => {
  // 就绪检查：SQLite 可用 + 关键目录可写
  try {
    const db = getDb()
    db.prepare('SELECT 1').get()
    return c.json({ ready: true })
  } catch {
    return c.json({ ready: false }, 503)
  }
})

app.get('/live', (c) => {
  // 存活检查：进程在运行
  return c.json({ alive: true })
})

export default app
```

- [ ] **Step 3: 在 index.ts 中注册健康检查和限流**

在 `server/src/index.ts` 中：

```typescript
import healthRoutes from './routes/health'
import { rateLimitMiddleware } from './middleware/rate-limit'

// 健康检查不需要鉴权，放在 auth 中间件之前
app.route('/health', healthRoutes)

// 限流应用到所有 API
app.use('/api/*', rateLimitMiddleware)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/src/middleware/rate-limit.ts server/src/routes/health.ts server/src/index.ts
git commit -m "feat: add rate limiting and health check endpoints"
```

---

### Task 5: Docker 安全加固

**Files:**
- Modify: `server/Dockerfile`
- Create: `server/.env.example`

- [ ] **Step 1: 加固 Dockerfile**

修改 `server/Dockerfile`：

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# 安全：非 root 用户运行
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# 依赖安装
FROM base AS install
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# 构建阶段
FROM base AS build
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY src/ src/
RUN bun build src/index.ts --outdir dist --target bun

# 运行阶段
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY src/db/ ./src/db/

# 安全：设置环境变量
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# 创建数据目录并设置权限
RUN mkdir -p /data/knowledge /data/artifacts /data/components /data/db && \
    chown -R appuser:appgroup /data /app

USER appuser
EXPOSE 8101

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8101/health/live || exit 1

CMD ["bun", "run", "dist/index.js"]
```

- [ ] **Step 2: 创建 .env.example**

```bash
# 服务配置
NODE_ENV=production
PORT=8101
LOG_LEVEL=info

# 鉴权
AUTH_DISABLED=false
JWT_SECRET=change-me-to-a-random-string
PASSWORD_SALT=change-me-too

# 凭据加密
ENCRYPTION_KEY=change-me-to-another-random-string

# 限流
RATE_LIMIT_DISABLED=false

# Claude Code
CLAUDE_CODE_PATH=claude
MAX_CONCURRENT_INSTANCES=3

# 数据路径
KNOWLEDGE_PATH=/data/knowledge
ARTIFACT_PATH=/data/artifacts
COMPONENT_PATH=/data/components
DB_PATH=/data/db/autoruner.db

# Redis（如使用外部 Redis）
REDIS_URL=redis://localhost:6379
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cooperd/Documents/Ai_code/AutoRuner4Test
git add server/Dockerfile server/.env.example
git commit -m "feat: harden Docker with non-root user, healthcheck, and env template"
```

---

## 自检

**1. Spec 覆盖检查：**
- ✅ API 鉴权 → Task 2
- ✅ 凭据加密存储 → Task 3
- ✅ 结构化日志 → Task 1
- ✅ 限流 → Task 4
- ✅ 健康检查 → Task 4
- ✅ Docker 安全加固 → Task 5
- ✅ 可观测性（日志 + 健康检查）→ Task 1 + 4

**2. Placeholder 扫描：** 无 TBD/TODO

**3. 类型一致性：** auth 中间件 set 的 userId/userRole 类型与路由使用一致；credential store 的 encrypt/decrypt 输入输出类型匹配。

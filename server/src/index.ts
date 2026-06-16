import { Hono } from 'hono'
import { migrate } from './db/migrate'
import { closeDb } from './db/client'
import { componentRoutes } from './routes/components'
import { taskRoutes } from './routes/tasks'
import { knowledgeRoutes } from './routes/knowledge'
import authRoutes from './routes/auth'
import healthRoutes from './routes/health'
import { authMiddleware } from './middleware/auth'
import { rateLimitMiddleware } from './middleware/rate-limit'
import { createWorker } from './queue/worker'
import { addClient, removeClient, handleSubscription } from './ws/handler'
import { workspaceTemplateRoutes } from './routes/workspace-templates'
import { workspaceSessionRoutes } from './routes/workspace-sessions'
import { moduleLogger } from './services/logger'

const log = moduleLogger('server')

const app = new Hono()

app.onError((err, c) => {
  if (err instanceof SyntaxError) {
    return c.json({ error: 'Invalid JSON in request body' }, 400)
  }
  return c.json({ error: 'Internal server error' }, 500)
})

app.get('/', (c) => c.json({ name: 'autoruner4test', version: '0.1.0' }))

// 健康检查（不需要鉴权和限流）
app.route('/health', healthRoutes)

// 鉴权路由（不需要 auth 中间件）
app.route('/api/auth', authRoutes)

// 限流应用到所有 API
app.use('/api/*', rateLimitMiddleware)

// API 鉴权中间件（在 auth 路由之后注册，不影响 /api/auth/*）
app.use('/api/*', authMiddleware)

app.route('/api/components', componentRoutes)
app.route('/api/tasks', taskRoutes)
app.route('/api/knowledge', knowledgeRoutes)
app.route('/api/workspace-templates', workspaceTemplateRoutes)
app.route('/api/workspace-sessions', workspaceSessionRoutes)

// 启动时迁移
migrate()

if (process.env.SKIP_REDIS !== 'true') {
  try {
    createWorker()
    log.info('Task worker started')
  } catch (e) {
    log.warn('Redis not available, task worker not started', { error: (e as Error).message })
  }
}

const port = Number(process.env.PORT) || 3000

Bun.serve({
  port,
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === '/ws') {
      if (server.upgrade(req)) return
      return new Response('WebSocket upgrade failed', { status: 500 })
    }
    return app.fetch(req, server)
  },
  websocket: {
    open(ws) {
      const clientId = crypto.randomUUID()
      addClient(clientId, ws)
      ws.send(JSON.stringify({ event: 'connected', clientId }))
    },
    message(ws, message) {
      const data = typeof message === 'string' ? message : message.toString()
      handleSubscription(ws, data)
    },
    close(ws) {
      const clientId = (ws as any).__clientId
      if (clientId) removeClient(clientId)
    },
  },
})

log.info('Server started', { port, env: process.env.NODE_ENV || 'development' })

// 优雅关闭
process.on('SIGINT', () => {
  closeDb()
  process.exit(0)
})

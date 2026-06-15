import { Hono } from 'hono'
import { serve } from 'bun'
import { migrate } from './db/migrate'
import { closeDb } from './db/client'
import { componentRoutes } from './routes/components'

const app = new Hono()

app.get('/', (c) => c.json({ name: 'autoruner4test', version: '0.1.0' }))
app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/components', componentRoutes)

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

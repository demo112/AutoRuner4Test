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

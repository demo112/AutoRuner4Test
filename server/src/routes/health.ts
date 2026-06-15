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

  const allOk = checks.every(c => c.status === 'ok')
  return c.json({ status: allOk ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() }, allOk ? 200 : 503)
})

app.get('/ready', (c) => {
  try {
    const db = getDb()
    db.prepare('SELECT 1').get()
    return c.json({ ready: true })
  } catch {
    return c.json({ ready: false }, 503)
  }
})

app.get('/live', (c) => {
  return c.json({ alive: true })
})

export default app

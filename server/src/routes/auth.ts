import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { getDb } from '../db/client'
import { moduleLogger } from '../services/logger'

const log = moduleLogger('auth-route')
const app = new Hono()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + (process.env.PASSWORD_SALT || 'salt'))
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// POST /login
app.post('/login', async (c) => {
  const { username, password } = await c.req.json()
  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400)
  }

  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
  if (!user) {
    log.warn('Login failed: user not found', { username })
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const hash = await hashPassword(password)
  if (hash !== user.password_hash) {
    log.warn('Login failed: wrong password', { username })
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  db.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(user.id)

  const token = await sign(
    { sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 86400 },
    JWT_SECRET,
  )
  log.info('Login successful', { userId: user.id })
  return c.json({ token, user: { id: user.id, username: user.username, role: user.role } })
})

// POST /init — 首次初始化管理员（仅当无用户时可用）
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
  db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(id, username, hash, 'admin')

  log.info('Admin initialized', { userId: id })
  return c.json({ id, username, role: 'admin' }, 201)
})

export default app

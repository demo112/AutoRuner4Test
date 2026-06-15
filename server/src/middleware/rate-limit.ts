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

import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import { moduleLogger } from '../services/logger'

const log = moduleLogger('auth')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

interface JwtPayload {
  sub: string
  role: string
  exp: number
}

export const authMiddleware = createMiddleware(async (c, next) => {
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
    return next()
  } catch {
    log.warn('Invalid token', { path: c.req.path })
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

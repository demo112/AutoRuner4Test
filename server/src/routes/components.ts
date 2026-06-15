import { Hono } from 'hono'
import {
  listComponents,
  getComponent,
  installComponent,
  uninstallComponent,
  updateComponentConfig,
  getComponentSchema,
  toggleComponent,
} from '../services/component-registry'
import { credentialStore } from '../services/credential-store'

const SENSITIVE_PATTERNS = ['password', 'token', 'api_key', 'secret', 'apikey', 'accesskey', 'secretkey']

export const componentRoutes = new Hono()

// 列出所有组件
componentRoutes.get('/', (c) => {
  const type = c.req.query('type') as string | undefined
  const installedOnly = c.req.query('installed') === 'true'
  const components = listComponents(type, installedOnly)
  return c.json({ components })
})

// 获取单个组件
componentRoutes.get('/:id', (c) => {
  const comp = getComponent(c.req.param('id'))
  if (!comp) return c.json({ error: 'Component not found' }, 404)
  return c.json({ component: comp })
})

// 安装组件
componentRoutes.post('/install', async (c) => {
  const body = await c.req.json()
  if (!body.name || !body.type || !body.source) {
    return c.json({ error: 'name, type, source are required' }, 400)
  }
  if (!['skill', 'hook', 'mcp', 'rule'].includes(body.type)) {
    return c.json({ error: 'type must be skill, hook, mcp, or rule' }, 400)
  }
  const comp = installComponent(body)
  return c.json({ component: comp }, 201)
})

// 卸载组件
componentRoutes.delete('/:id', (c) => {
  const ok = uninstallComponent(c.req.param('id'))
  if (!ok) return c.json({ error: 'Component not found' }, 404)
  return c.json({ ok: true })
})

// 更新组件配置（敏感字段自动分离到凭据存储）
componentRoutes.put('/:id/config', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const safeConfig: Record<string, any> = {}
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_PATTERNS.some(p => key.toLowerCase().includes(p))) {
      credentialStore.save(id, key, String(value))
    } else {
      safeConfig[key] = value
    }
  }

  const comp = updateComponentConfig(id, safeConfig)
  if (!comp) return c.json({ error: 'Component not found' }, 404)
  return c.json({ component: comp })
})

// 获取组件配置 schema
componentRoutes.get('/:id/schema', (c) => {
  const schema = getComponentSchema(c.req.param('id'))
  if (!schema) return c.json({ error: 'Component not found' }, 404)
  return c.json({ schema })
})

// 启用/禁用组件
componentRoutes.patch('/:id/toggle', async (c) => {
  const body = await c.req.json()
  const comp = toggleComponent(c.req.param('id'), body.enabled)
  if (!comp) return c.json({ error: 'Component not found' }, 404)
  return c.json({ component: comp })
})

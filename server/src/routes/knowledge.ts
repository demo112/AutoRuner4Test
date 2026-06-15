import { Hono } from 'hono'
import {
  createKnowledge,
  getKnowledge,
  listKnowledge,
  updateKnowledge,
  searchKnowledge,
} from '../services/knowledge-store'

export const knowledgeRoutes = new Hono()

// 列表（支持 type、tag 过滤）
knowledgeRoutes.get('/', (c) => {
  const type = c.req.query('type') as string | undefined
  const tag = c.req.query('tag') as string | undefined
  return c.json({ items: listKnowledge(type, tag) })
})

// 搜索
knowledgeRoutes.get('/search', (c) => {
  const q = c.req.query('q')
  if (!q) return c.json({ error: 'q query param is required' }, 400)
  return c.json({ items: searchKnowledge(q) })
})

// 详情
knowledgeRoutes.get('/:id', (c) => {
  const item = getKnowledge(c.req.param('id'))
  if (!item) return c.json({ error: 'Knowledge not found' }, 404)
  return c.json({ item })
})

// 创建
knowledgeRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.type || !body.title) {
    return c.json({ error: 'type and title are required' }, 400)
  }

  const validTypes = ['pattern', 'lesson', 'defect_pattern', 'script_template']
  if (!validTypes.includes(body.type)) {
    return c.json({ error: `type must be one of: ${validTypes.join(', ')}` }, 400)
  }

  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    return c.json({ error: 'tags must be an array' }, 400)
  }

  const item = createKnowledge(body)
  return c.json({ item }, 201)
})

// 更新
knowledgeRoutes.put('/:id', async (c) => {
  const body = await c.req.json()

  if (body.type) {
    const validTypes = ['pattern', 'lesson', 'defect_pattern', 'script_template']
    if (!validTypes.includes(body.type)) {
      return c.json({ error: `type must be one of: ${validTypes.join(', ')}` }, 400)
    }
  }

  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    return c.json({ error: 'tags must be an array' }, 400)
  }

  const item = updateKnowledge(c.req.param('id'), body)
  if (!item) return c.json({ error: 'Knowledge not found' }, 404)
  return c.json({ item })
})

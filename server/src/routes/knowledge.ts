import { Hono } from 'hono'
import {
  createKnowledge,
  getKnowledge,
  listKnowledge,
  updateKnowledge,
  searchKnowledge,
} from '../services/knowledge-store'
import { runDistillation, getUnprocessedCount } from '../services/knowledge-distill'
import { buildLinks, getRelated } from '../services/knowledge-graph'
import { recommendKnowledge } from '../services/knowledge-recommend'

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

// 蒸馏状态
knowledgeRoutes.get('/distill/status', (c) => {
  const unprocessed = getUnprocessedCount()
  return c.json({ unprocessed_count: unprocessed, needs_distillation: unprocessed >= 5 })
})

// 手动触发蒸馏
knowledgeRoutes.post('/distill', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const result = runDistillation(body.task_id)
  return c.json(result)
})

// 构建关联图谱
knowledgeRoutes.post('/graph/build', (c) => {
  const result = buildLinks()
  return c.json(result)
})

// 推荐知识
knowledgeRoutes.get('/recommend', (c) => {
  const type = c.req.query('type') || ''
  const tags = (c.req.query('tags') || '').split(',').filter(Boolean)
  const recommendations = recommendKnowledge(type, tags)
  return c.json({ recommendations })
})

// 详情（放在固定路径路由之后，避免被 /:id 拦截）
knowledgeRoutes.get('/:id', (c) => {
  const id = c.req.param('id')
  const item = getKnowledge(id)
  if (!item) return c.json({ error: 'Knowledge not found' }, 404)
  return c.json({ item })
})

// 关联知识
knowledgeRoutes.get('/:id/related', (c) => {
  const id = c.req.param('id')
  const related = getRelated(id)
  return c.json({ related })
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

import { Hono } from 'hono'
import { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate } from '../services/pipeline-template-service'

export const pipelineTemplateRoutes = new Hono()

pipelineTemplateRoutes.get('/', (c) => {
  const templates = listTemplates()
  return c.json(templates)
})

pipelineTemplateRoutes.get('/:id', (c) => {
  const id = c.req.param('id')
  const template = getTemplate(id)
  if (!template) return c.json({ error: '模板不存在' }, 404)
  return c.json(template)
})

pipelineTemplateRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { name, description, nodes, edges, is_public, created_by } = body

  if (!name || !created_by) {
    return c.json({ error: 'name 和 created_by 为必填项' }, 400)
  }

  const result = createTemplate({ name, description, nodes, edges, is_public, created_by })
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result, 201)
})

pipelineTemplateRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name, description, nodes, edges, is_public, created_by } = body

  const result = updateTemplate(id, { name, description, nodes, edges, is_public }, created_by || 'operator')
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

pipelineTemplateRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const result = deleteTemplate(id, body.created_by || 'operator')
  if ('error' in result) return c.json({ error: result.error }, 404)
  return c.json({ success: true })
})

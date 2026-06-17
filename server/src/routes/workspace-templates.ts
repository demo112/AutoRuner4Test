import { Hono } from 'hono'
import * as svc from '../services/workspace-template-service.js'

export const workspaceTemplateRoutes = new Hono()

// List with category/starter filters
workspaceTemplateRoutes.get('/', (c) => {
  const category = c.req.query('category')
  const starter = c.req.query('starter')
  const filters: { category?: string; starter?: boolean } = {}
  if (category) filters.category = category
  if (starter !== undefined) filters.starter = starter === 'true'

  const templates = svc.listTemplates(filters)
  return c.json({ templates })
})

// Get single template
workspaceTemplateRoutes.get('/:id', (c) => {
  const template = svc.getTemplate(c.req.param('id'))
  if (!template) return c.json({ error: 'Template not found' }, 404)
  return c.json({ template })
})

// Create template (no role required, name required)
workspaceTemplateRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.name) return c.json({ error: 'name is required' }, 400)

  try {
    const template = svc.createTemplate({
      name: body.name,
      description: body.description,
      category: body.category,
      claude_md: body.claude_md,
      skills: body.skills,
      hooks: body.hooks,
      mcp_servers: body.mcp_servers,
      rules: body.rules,
      review_gates: body.review_gates,
      input_schema: body.input_schema,
      output_description: body.output_description,
      is_public: body.is_public,
      is_starter: body.is_starter,
      created_by: body.created_by,
    })
    return c.json({ template }, 201)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

// Update template
workspaceTemplateRoutes.put('/:id', async (c) => {
  const body = await c.req.json()
  try {
    const template = svc.updateTemplate(c.req.param('id'), body)
    if (!template) return c.json({ error: 'Template not found' }, 404)
    return c.json({ template })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

// Clone template
workspaceTemplateRoutes.post('/:id/clone', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const template = svc.cloneTemplate(c.req.param('id'), body.created_by)
  if (!template) return c.json({ error: 'Template not found' }, 404)
  return c.json({ template }, 201)
})

// Preview .claude/ directory
workspaceTemplateRoutes.get('/:id/preview', (c) => {
  const preview = svc.previewClaudeDir(c.req.param('id'))
  if (!preview) return c.json({ error: 'Template not found' }, 404)
  return c.json({ preview })
})

// Delete template
workspaceTemplateRoutes.delete('/:id', (c) => {
  const ok = svc.deleteTemplate(c.req.param('id'))
  if (!ok) return c.json({ error: 'Template not found' }, 404)
  return c.json({ ok: true })
})

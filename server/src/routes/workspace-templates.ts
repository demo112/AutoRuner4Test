import { Hono } from 'hono'
import * as templateService from '../services/workspace-template-service.js'

const router = new Hono()

router.get('/', (c) => {
  const publicOnly = c.req.query('public') === 'true'
  const templates = templateService.listTemplates(publicOnly)
  return c.json({ templates })
})

router.get('/:id', (c) => {
  const template = templateService.getTemplate(c.req.param('id'))
  if (!template) return c.json({ error: 'Template not found' }, 404)
  return c.json(template)
})

router.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.name || !body.role) return c.json({ error: 'name and role are required' }, 400)
  const template = templateService.createTemplate(body)
  return c.json(template, 201)
})

router.put('/:id', async (c) => {
  const body = await c.req.json()
  const template = templateService.updateTemplate(c.req.param('id'), body)
  if (!template) return c.json({ error: 'Template not found' }, 404)
  return c.json(template)
})

router.delete('/:id', (c) => {
  const deleted = templateService.deleteTemplate(c.req.param('id'))
  if (!deleted) return c.json({ error: 'Template not found' }, 404)
  return c.json({ ok: true })
})

export const workspaceTemplateRoutes = router

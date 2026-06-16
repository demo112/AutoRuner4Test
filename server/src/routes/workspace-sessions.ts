import { Hono } from 'hono'
import * as sessionService from '../services/workspace-session-service.js'

const router = new Hono()

router.get('/', (c) => {
  const sessions = sessionService.listSessions()
  return c.json({ sessions })
})

router.get('/:id', (c) => {
  const session = sessionService.getSession(c.req.param('id'))
  if (!session) return c.json({ error: 'Session not found' }, 404)
  return c.json(session)
})

router.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.template_id) return c.json({ error: 'template_id is required' }, 400)
  const session = sessionService.createSession(body)
  if ('error' in session) return c.json({ error: session.error }, 400)
  return c.json(session, 201)
})

router.post('/:id/start', async (c) => {
  const session = await sessionService.startSession(c.req.param('id'))
  if (!session) return c.json({ error: 'Session not found or not pending' }, 404)
  return c.json(session)
})

router.post('/:id/review/:stageId', async (c) => {
  const body = await c.req.json()
  if (body.approved === undefined) return c.json({ error: 'approved is required' }, 400)
  const session = await sessionService.reviewSessionStage(
    c.req.param('id'),
    c.req.param('stageId'),
    body.approved,
    body.comment,
  )
  if (!session) return c.json({ error: 'Session not found' }, 404)
  return c.json(session)
})

router.post('/:id/retry/:stageId', async (c) => {
  const session = await sessionService.retrySessionStage(
    c.req.param('id'),
    c.req.param('stageId'),
  )
  if (!session) return c.json({ error: 'Session not found' }, 404)
  return c.json(session)
})

router.post('/:id/cancel', (c) => {
  const session = sessionService.cancelSession(c.req.param('id'))
  if (!session) return c.json({ error: 'Session not found or not cancellable' }, 404)
  return c.json(session)
})

export const workspaceSessionRoutes = router

import { Hono } from 'hono'
import * as sessionService from '../services/workspace-session-service.js'
import * as executor from '../services/workspace-executor.js'

export const workspaceSessionRoutes = new Hono()

// List all sessions
workspaceSessionRoutes.get('/', (c) => {
  const sessions = sessionService.listSessions()
  return c.json({ sessions })
})

// Get session detail (user view — strips internal state)
workspaceSessionRoutes.get('/:id', (c) => {
  const session = sessionService.getSessionForUser(c.req.param('id'))
  if (!session) return c.json({ error: 'Session not found' }, 404)
  return c.json({ session })
})

// Create session from template
workspaceSessionRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.template_id) return c.json({ error: 'template_id is required' }, 400)

  try {
    const session = sessionService.createSession({
      template_id: body.template_id,
      input: body.input,
      created_by: body.created_by,
    })
    return c.json({ session }, 201)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

// Start session execution
workspaceSessionRoutes.post('/:id/start', (c) => {
  const id = c.req.param('id')
  try {
    const session = sessionService.startSession(id)
    if (!session) return c.json({ error: 'Session not found' }, 404)
    // Fire-and-forget executor
    executor.runSession(id)
    return c.json({ session })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

// Review gate (approve or reject)
workspaceSessionRoutes.post('/:id/review/:gateId', async (c) => {
  const body = await c.req.json()
  const { id, gateId } = c.req.param()

  if (!body.result || !['approved', 'rejected'].includes(body.result)) {
    return c.json({ error: 'result must be "approved" or "rejected"' }, 400)
  }

  try {
    await executor.continueAfterReview(id, gateId, body.result, body.comment || '')
    const session = sessionService.getSessionForUser(id)
    return c.json({ session })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

// Retry from failed gate
workspaceSessionRoutes.post('/:id/retry/:gateId', (c) => {
  const { id, gateId } = c.req.param()

  try {
    sessionService.retrySession(id, gateId)
    executor.runSession(id)
    const session = sessionService.getSessionForUser(id)
    return c.json({ session })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

// Cancel session
workspaceSessionRoutes.post('/:id/cancel', (c) => {
  try {
    const session = sessionService.cancelSession(c.req.param('id'))
    if (!session) return c.json({ error: 'Session not found' }, 404)
    return c.json({ session })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }
})

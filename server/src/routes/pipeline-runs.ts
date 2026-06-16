import { Hono } from 'hono'
import { listRuns, getRun, createRun, startRun, confirmRunNode, cancelPipelineRun, retryRunNode } from '../services/pipeline-run-service'

export const pipelineRunRoutes = new Hono()

pipelineRunRoutes.get('/', (c) => {
  const runs = listRuns()
  return c.json(runs)
})

pipelineRunRoutes.get('/:id', (c) => {
  const id = c.req.param('id')
  const run = getRun(id)
  if (!run) return c.json({ error: '运行不存在' }, 404)
  return c.json(run)
})

pipelineRunRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { template_id, initial_input, created_by } = body

  if (!template_id || !created_by) {
    return c.json({ error: 'template_id 和 created_by 为必填项' }, 400)
  }

  const result = createRun({ template_id, initial_input, created_by })
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result, 201)
})

pipelineRunRoutes.post('/:id/start', async (c) => {
  const id = c.req.param('id')
  const result = await startRun(id)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

pipelineRunRoutes.post('/:id/confirm/:nodeId', async (c) => {
  const id = c.req.param('id')
  const nodeId = c.req.param('nodeId')
  const body = await c.req.json().catch(() => ({}))
  const approved = body.approved !== false
  const comment = body.comment as string | undefined

  const result = confirmRunNode(id, nodeId, approved, comment)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

pipelineRunRoutes.post('/:id/cancel', (c) => {
  const id = c.req.param('id')
  const result = cancelPipelineRun(id)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

pipelineRunRoutes.post('/:id/retry/:nodeId', (c) => {
  const id = c.req.param('id')
  const nodeId = c.req.param('nodeId')
  const result = retryRunNode(id, nodeId)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

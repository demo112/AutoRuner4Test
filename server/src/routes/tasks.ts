import { Hono } from 'hono'
import {
  createTask,
  getTask,
  listTasks,
  startTask,
  approveTask,
  rejectTask,
  retryTask,
} from '../services/task-runner'
import { getArtifact, getArtifactsByTask } from '../services/artifact-store'

export const taskRoutes = new Hono()

// 任务列表
taskRoutes.get('/', (c) => {
  const type = c.req.query('type') as string | undefined
  const status = c.req.query('status') as string | undefined
  return c.json({ tasks: listTasks(type, status) })
})

// 创建任务
taskRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.type) return c.json({ error: 'type is required' }, 400)
  const validTypes = ['requirement-analysis', 'testcase-generation', 'script-conversion', 'execution-analysis', 'issue-triage']
  if (!validTypes.includes(body.type)) {
    return c.json({ error: `type must be one of: ${validTypes.join(', ')}` }, 400)
  }
  const task = createTask(body)
  return c.json({ task }, 201)
})

// 任务详情
taskRoutes.get('/:id', (c) => {
  const task = getTask(c.req.param('id'))
  if (!task) return c.json({ error: 'Task not found' }, 404)
  return c.json({ task })
})

// 启动任务
taskRoutes.post('/:id/start', (c) => {
  const result = startTask(c.req.param('id'))
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json({ task: result })
})

// 确认任务
taskRoutes.post('/:id/approve', (c) => {
  const result = approveTask(c.req.param('id'))
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json({ task: result })
})

// 驳回任务
taskRoutes.post('/:id/reject', (c) => {
  const result = rejectTask(c.req.param('id'))
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json({ task: result })
})

// 重试任务
taskRoutes.post('/:id/retry', (c) => {
  const result = retryTask(c.req.param('id'))
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json({ task: result })
})

// 获取任务产出物
taskRoutes.get('/:id/artifacts', (c) => {
  const taskId = c.req.param('id')
  const task = getTask(taskId)
  if (!task) return c.json({ error: 'Task not found' }, 404)
  return c.json({ artifacts: getArtifactsByTask(taskId) })
})

// 获取单个产出物内容
taskRoutes.get('/:id/artifact', async (c) => {
  const artifactId = c.req.query('artifact_id')
  if (!artifactId) return c.json({ error: 'artifact_id query param required' }, 400)
  const artifact = getArtifact(artifactId)
  if (!artifact) return c.json({ error: 'Artifact not found' }, 404)
  return c.json(artifact)
})

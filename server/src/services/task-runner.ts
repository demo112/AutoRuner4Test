import { getDb } from '../db/client'
import type { Task } from '../db/schema'

const TASK_TYPE_CONFIG: Record<string, { needsReview: boolean; description: string }> = {
  'requirement-analysis': { needsReview: true, description: '需求分析' },
  'testcase-generation': { needsReview: false, description: '用例生成' },
  'script-conversion': { needsReview: false, description: '脚本转换' },
  'execution-analysis': { needsReview: true, description: '执行分析' },
  'issue-triage': { needsReview: true, description: '提单处理' },
}

export { TASK_TYPE_CONFIG }

export function createTask(data: {
  type: Task['type']
  component_ids?: string[]
  config?: Record<string, any>
  input_artifact_id?: string
}): Task {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO tasks (id, type, status, component_ids, config, input_artifact_id, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(
    id, data.type,
    JSON.stringify(data.component_ids || []),
    JSON.stringify(data.config || {}),
    data.input_artifact_id || null,
    now, now
  )
  const task = getTask(id)
  if (!task) throw new Error('Failed to retrieve created task')
  return task
}

export function getTask(id: string): Task | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
}

export function listTasks(type?: string, status?: string): Task[] {
  const db = getDb()
  let sql = 'SELECT * FROM tasks WHERE 1=1'
  const params: string[] = []
  if (type) {
    sql += ' AND type = ?'
    params.push(type)
  }
  if (status) {
    sql += ' AND status = ?'
    params.push(status)
  }
  sql += ' ORDER BY created_at DESC'
  return db.prepare(sql).all(...params) as Task[]
}

// 状态机转换
const VALID_TRANSITIONS: Array<{ from: Task['status']; to: Task['status'] }> = [
  { from: 'pending', to: 'running' },
  { from: 'running', to: 'review' },
  { from: 'running', to: 'completed' },
  { from: 'running', to: 'failed' },
  { from: 'review', to: 'approved' },
  { from: 'review', to: 'failed' },
  { from: 'approved', to: 'completed' },
  { from: 'failed', to: 'pending' },
]

function canTransition(from: Task['status'], to: Task['status']): boolean {
  return VALID_TRANSITIONS.some(t => t.from === from && t.to === to)
}

export function transitionTask(id: string, newStatus: Task['status']): Task | { error: string } {
  const task = getTask(id)
  if (!task) return { error: 'Task not found' }
  if (!canTransition(task.status, newStatus)) {
    return { error: `Cannot transition from ${task.status} to ${newStatus}` }
  }
  const db = getDb()
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(newStatus, new Date().toISOString(), id)
  const updated = getTask(id)
  if (!updated) return { error: 'Failed to retrieve updated task' }
  return updated
}

export function startTask(id: string): Task | { error: string } {
  const task = getTask(id)
  if (!task) return { error: 'Task not found' }
  if (!canTransition(task.status, 'running')) {
    return { error: `Cannot transition from ${task.status} to running` }
  }
  const db = getDb()
  const now = new Date().toISOString()
  // needsReview=false 的任务类型，running 状态标记为实际 running
  // 需要人工 review 的任务才会进入 review 状态
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run('running', now, id)
  return getTask(id) as Task
}

export function approveTask(id: string): Task | { error: string } {
  const task = getTask(id)
  if (!task) return { error: 'Task not found' }
  if (!canTransition(task.status, 'approved')) {
    return { error: `Cannot transition from ${task.status} to approved` }
  }
  const db = getDb()
  const now = new Date().toISOString()
  // 原子跳转：review → completed，跳过 approved 中间状态
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run('completed', now, id)
  const updated = getTask(id)
  if (!updated) return { error: 'Failed to retrieve updated task' }
  return updated
}

export function rejectTask(id: string): Task | { error: string } {
  return transitionTask(id, 'failed')
}

export function retryTask(id: string): Task | { error: string } {
  return transitionTask(id, 'pending')
}

// running → review（needsReview=true 的任务完成后调用）
export function submitForReview(id: string): Task | { error: string } {
  const task = getTask(id)
  if (!task) return { error: 'Task not found' }
  const typeInfo = TASK_TYPE_CONFIG[task.type]
  if (typeInfo && !typeInfo.needsReview) {
    return { error: `Task type ${task.type} does not require review, use completeTask instead` }
  }
  return transitionTask(id, 'review')
}

// running → completed（needsReview=false 的任务完成后调用）
export function completeTask(id: string): Task | { error: string } {
  const task = getTask(id)
  if (!task) return { error: 'Task not found' }
  const typeInfo = TASK_TYPE_CONFIG[task.type]
  if (typeInfo && typeInfo.needsReview) {
    return { error: `Task type ${task.type} requires review, use submitForReview instead` }
  }
  return transitionTask(id, 'completed')
}

export function getTaskTypeInfo(type: string) {
  return TASK_TYPE_CONFIG[type] || null
}

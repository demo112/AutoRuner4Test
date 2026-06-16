import { getDb } from '../db/client'
import type { PipelineRun } from '../db/schema'
import { executeRun, confirmNode, resumeRun, cancelRun, retryNode } from './pipeline-executor'
import { getTemplate } from './pipeline-template-service'
import { moduleLogger } from './logger'

const log = moduleLogger('pipeline-run-service')

export function listRuns(): PipelineRun[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM pipeline_runs ORDER BY created_at DESC').all() as Record<string, unknown>[]
  return rows.map(deserializeRun)
}

export function getRun(id: string): PipelineRun | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return deserializeRun(row)
}

export function createRun(data: {
  template_id: string
  initial_input?: Record<string, unknown>
  created_by: string
}): PipelineRun | { error: string } {
  const template = getTemplate(data.template_id)
  if (!template) return { error: '模板不存在' }

  const id = crypto.randomUUID()
  const db = getDb()

  const initialNodeStates: Record<string, unknown> = {}
  for (const node of template.nodes) {
    initialNodeStates[node.id] = {
      status: 'pending',
      started_at: null,
      completed_at: null,
      outputs: {},
      error: null,
      execution_log: null,
    }
  }

  db.prepare(
    `INSERT INTO pipeline_runs (id, template_id, template_version, status, context, node_states, current_nodes, initial_input, created_by)
     VALUES (?, ?, ?, 'pending', '{}', ?, '[]', ?, ?)`
  ).run(
    id,
    data.template_id,
    template.version,
    JSON.stringify(initialNodeStates),
    JSON.stringify(data.initial_input || {}),
    data.created_by,
  )

  return getRun(id)!
}

export async function startRun(id: string): Promise<PipelineRun | { error: string }> {
  const run = getRun(id)
  if (!run) return { error: '运行不存在' }
  if (run.status !== 'pending') return { error: '只能启动待执行的运行' }

  await executeRun(id)
  return getRun(id)!
}

export function confirmRunNode(id: string, nodeId: string, approved: boolean, comment?: string): { success: boolean } | { error: string } {
  const result = confirmNode(id, nodeId, approved, comment)
  if ('error' in result) return result

  resumeRun(id).catch(err => log.error('resume after confirm failed', { error: (err as Error).message }))
  return { success: true }
}

export function cancelPipelineRun(id: string): { success: boolean } | { error: string } {
  return cancelRun(id)
}

export function retryRunNode(id: string, nodeId: string): { success: boolean } | { error: string } {
  const result = retryNode(id, nodeId)
  if ('error' in result) return result

  executeRun(id).catch(err => log.error('retry execute failed', { error: (err as Error).message }))
  return { success: true }
}

function deserializeRun(row: Record<string, unknown>): PipelineRun {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    template_version: row.template_version as number,
    status: row.status as PipelineRun['status'],
    context: JSON.parse((row.context as string) || '{}'),
    node_states: JSON.parse((row.node_states as string) || '{}'),
    current_nodes: JSON.parse((row.current_nodes as string) || '[]'),
    initial_input: JSON.parse((row.initial_input as string) || '{}'),
    started_at: (row.started_at as string) || null,
    completed_at: (row.completed_at as string) || null,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
  }
}

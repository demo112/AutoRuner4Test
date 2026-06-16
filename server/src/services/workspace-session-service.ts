import { getDb } from '../db/client'
import type { WorkspaceSession, StageState } from '../db/schema'
import { getTemplate } from './workspace-template-service'
import { runSession, resumeSession, reviewStage } from './workspace-executor'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-session-service')

function rowToSession(row: Record<string, unknown>): WorkspaceSession {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    template_version: row.template_version as number,
    status: row.status as WorkspaceSession['status'],
    current_stage: (row.current_stage as string) || null,
    input: JSON.parse((row.input as string) || '{}'),
    context: JSON.parse((row.context as string) || '{}'),
    stage_states: JSON.parse((row.stage_states as string) || '{}'),
    created_by: (row.created_by as string) || 'operator',
    started_at: (row.started_at as string) || null,
    completed_at: (row.completed_at as string) || null,
    created_at: row.created_at as string,
  }
}

export function listSessions(): WorkspaceSession[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM workspace_sessions ORDER BY created_at DESC').all() as Record<string, unknown>[]
  return rows.map(rowToSession)
}

export function getSession(id: string): WorkspaceSession | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToSession(row) : null
}

export function createSession(data: {
  template_id: string
  input: Record<string, unknown>
  created_by?: string
}): WorkspaceSession | { error: string } {
  const template = getTemplate(data.template_id)
  if (!template) return { error: '模板不存在' }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const stageStates: Record<string, StageState> = {}
  for (const stage of template.stages) {
    stageStates[stage.id] = {
      status: 'pending',
      started_at: '',
      completed_at: '',
      output: null,
    }
  }

  const db = getDb()
  db.prepare(`
    INSERT INTO workspace_sessions (id, template_id, template_version, status, current_stage, input, context, stage_states, created_by, started_at, completed_at, created_at)
    VALUES (?, ?, ?, 'pending', NULL, ?, '{}', ?, ?, NULL, NULL, ?)
  `).run(
    id,
    data.template_id,
    template.version,
    JSON.stringify(data.input),
    JSON.stringify(stageStates),
    data.created_by || 'operator',
    now,
  )

  log.info('created workspace session', { id, templateId: data.template_id })
  return getSession(id)!
}

export async function startSession(id: string): Promise<WorkspaceSession | null> {
  const session = getSession(id)
  if (!session) return null
  if (session.status !== 'pending') return null

  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE workspace_sessions SET status = 'running', started_at = ? WHERE id = ?
  `).run(now, id)

  // Fire-and-forget: let the executor run in the background
  runSession(id).catch(err => log.error('runSession failed', { sessionId: id, error: (err as Error).message }))

  return getSession(id)
}

export async function reviewSessionStage(
  sessionId: string,
  stageId: string,
  approved: boolean,
  comment?: string,
): Promise<WorkspaceSession | null> {
  const result = reviewStage(sessionId, stageId, approved, comment)
  if ('error' in result) return getSession(sessionId)

  if (approved) {
    resumeSession(sessionId).catch(err => log.error('resumeSession after review failed', { sessionId, error: (err as Error).message }))
  }

  return getSession(sessionId)
}

export async function retrySessionStage(
  sessionId: string,
  stageId: string,
): Promise<WorkspaceSession | null> {
  const session = getSession(sessionId)
  if (!session) return null

  const stageState = session.stage_states[stageId]
  if (!stageState) return null

  // Reset the stage to pending
  stageState.status = 'pending'
  stageState.started_at = ''
  stageState.completed_at = ''
  stageState.output = null
  delete stageState.error
  delete stageState.review_result
  delete stageState.review_comment

  const db = getDb()
  const status = session.status === 'failed' ? 'running' : session.status
  db.prepare(`
    UPDATE workspace_sessions SET status = ?, stage_states = ? WHERE id = ?
  `).run(status, JSON.stringify(session.stage_states), sessionId)

  // Resume execution from the retried stage
  resumeSession(sessionId).catch(err => log.error('resumeSession after retry failed', { sessionId, error: (err as Error).message }))

  return getSession(sessionId)
}

export function cancelSession(id: string): WorkspaceSession | null {
  const session = getSession(id)
  if (!session) return null
  if (session.status !== 'running' && session.status !== 'paused') return null

  const db = getDb()
  db.prepare(`UPDATE workspace_sessions SET status = 'cancelled' WHERE id = ?`).run(id)

  log.info('cancelled workspace session', { id })
  return getSession(id)
}

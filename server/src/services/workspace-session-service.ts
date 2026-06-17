import { getDb } from '../db/client'
import type { WorkspaceSession, ReviewRecord, SegmentState } from '../db/schema'
import { getTemplate } from './workspace-template-service'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-session-service')

// ── List ──────────────────────────────────────────────

export function listSessions(): WorkspaceSession[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM workspace_sessions ORDER BY created_at DESC').all() as Record<string, unknown>[]
  return rows.map(rowToSession)
}

// ── Get (full) ────────────────────────────────────────

export function getSession(id: string): WorkspaceSession | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToSession(row) : null
}

// ── Get for User (strips internal state) ──────────────

export function getSessionForUser(id: string): Omit<WorkspaceSession, 'segment_states' | 'context'> | null {
  const session = getSession(id)
  if (!session) return null
  const { segment_states, context, ...userView } = session
  return userView
}

// ── Create ────────────────────────────────────────────

export interface CreateSessionInput {
  template_id: string
  input?: Record<string, unknown>
  created_by?: string
}

export function createSession(input: CreateSessionInput): WorkspaceSession {
  const db = getDb()
  const template = getTemplate(input.template_id)
  if (!template) throw new Error('Template not found')

  // Initialize segment states from gates
  const gateCount = template.review_gates.length
  const segmentCount = gateCount + 1
  const segmentStates: Record<string, SegmentState> = {}
  for (let i = 0; i < segmentCount; i++) {
    segmentStates[`segment_${i}`] = {
      status: 'pending',
      started_at: '',
      completed_at: '',
      output: null,
      error: null,
    }
  }

  const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  db.prepare(`
    INSERT INTO workspace_sessions (id, template_id, template_version, status, input, segment_states)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(
    id,
    input.template_id,
    template.version,
    JSON.stringify(input.input || {}),
    JSON.stringify(segmentStates),
  )

  return getSession(id)!
}

// ── Start ─────────────────────────────────────────────

export function startSession(id: string): WorkspaceSession | null {
  const db = getDb()
  const session = getSession(id)
  if (!session) return null
  if (session.status !== 'pending') throw new Error(`Cannot start session in status: ${session.status}`)

  db.prepare(`
    UPDATE workspace_sessions
    SET status = 'running', started_at = datetime('now')
    WHERE id = ?
  `).run(id)

  return getSession(id)
}

// ── Update status ─────────────────────────────────────

export function updateSessionStatus(
  id: string,
  status: WorkspaceSession['status'],
  extra?: { current_gate?: string | null; output?: unknown; error?: string | null }
): WorkspaceSession | null {
  const db = getDb()
  const session = getSession(id)
  if (!session) return null

  const updates: string[] = ["status = ?"]
  const values: unknown[] = [status]

  if (extra?.current_gate !== undefined) {
    updates.push('current_gate = ?')
    values.push(extra.current_gate)
  }
  if (extra?.output !== undefined) {
    updates.push('output = ?')
    values.push(JSON.stringify(extra.output))
  }
  if (extra?.error !== undefined) {
    updates.push('error = ?')
    values.push(extra.error)
  }
  if (status === 'completed') {
    updates.push("completed_at = datetime('now')")
  }

  values.push(id)
  db.prepare(`UPDATE workspace_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  return getSession(id)
}

// ── Update segment state ──────────────────────────────

export function updateSegmentState(
  sessionId: string,
  segmentKey: string,
  state: Partial<SegmentState>
): void {
  const db = getDb()
  const session = getSession(sessionId)
  if (!session) return

  const states = { ...session.segment_states }
  states[segmentKey] = { ...states[segmentKey], ...state }

  db.prepare('UPDATE workspace_sessions SET segment_states = ? WHERE id = ?').run(
    JSON.stringify(states),
    sessionId,
  )
}

// ── Update context ────────────────────────────────────

export function updateContext(sessionId: string, context: Record<string, unknown>): void {
  const db = getDb()
  db.prepare('UPDATE workspace_sessions SET context = ? WHERE id = ?').run(
    JSON.stringify(context),
    sessionId,
  )
}

// ── Review ────────────────────────────────────────────

export function reviewSession(
  sessionId: string,
  gateId: string,
  result: 'approved' | 'rejected',
  comment: string
): WorkspaceSession | null {
  const db = getDb()
  const session = getSession(sessionId)
  if (!session) throw new Error('Session not found')
  if (session.status !== 'waiting_review') throw new Error('Session is not waiting for review')
  if (session.current_gate !== gateId) throw new Error(`Current gate is ${session.current_gate}, not ${gateId}`)

  const record: ReviewRecord = {
    gateId,
    result,
    comment,
    reviewed_at: new Date().toISOString(),
  }

  const history = [...session.review_history, record]

  db.prepare(`
    UPDATE workspace_sessions SET review_history = ? WHERE id = ?
  `).run(JSON.stringify(history), sessionId)

  return getSession(sessionId)
}

// ── Cancel ────────────────────────────────────────────

export function cancelSession(id: string): WorkspaceSession | null {
  const db = getDb()
  const session = getSession(id)
  if (!session) return null
  if (!['pending', 'running', 'waiting_review'].includes(session.status)) {
    throw new Error(`Cannot cancel session in status: ${session.status}`)
  }

  db.prepare(`
    UPDATE workspace_sessions
    SET status = 'cancelled', completed_at = datetime('now')
    WHERE id = ?
  `).run(id)

  return getSession(id)
}

// ── Retry ─────────────────────────────────────────────

export function retrySession(sessionId: string, gateId: string): void {
  const db = getDb()
  const session = getSession(sessionId)
  if (!session) throw new Error('Session not found')
  if (session.status !== 'failed' && session.status !== 'waiting_review') {
    throw new Error(`Cannot retry session in status: ${session.status}`)
  }

  // Find the segment that corresponds to this gate
  const template = getTemplate(session.template_id)
  if (!template) throw new Error('Template not found')

  const gateIndex = template.review_gates.findIndex(g => g.id === gateId)
  if (gateIndex === -1) throw new Error(`Gate ${gateId} not found in template`)

  const segmentKey = `segment_${gateIndex + 1}`

  // Reset the segment state
  const states = { ...session.segment_states }
  states[segmentKey] = {
    status: 'pending',
    started_at: '',
    completed_at: '',
    output: null,
    error: null,
  }

  db.prepare(`
    UPDATE workspace_sessions SET status = 'running', segment_states = ?, error = NULL, current_gate = NULL
    WHERE id = ?
  `).run(JSON.stringify(states), sessionId)
}

// ── Row mapper ────────────────────────────────────────

function rowToSession(row: Record<string, unknown>): WorkspaceSession {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    template_version: row.template_version as number,
    status: row.status as WorkspaceSession['status'],
    current_gate: (row.current_gate as string) || null,
    input: JSON.parse((row.input as string) || '{}'),
    output: row.output ? JSON.parse(row.output as string) : null,
    review_history: JSON.parse((row.review_history as string) || '[]'),
    context: JSON.parse((row.context as string) || '{}'),
    segment_states: JSON.parse((row.segment_states as string) || '{}'),
    error: (row.error as string) || null,
    created_by: (row.created_by as string) || null,
    started_at: (row.started_at as string) || null,
    completed_at: (row.completed_at as string) || null,
    created_at: row.created_at as string,
  }
}

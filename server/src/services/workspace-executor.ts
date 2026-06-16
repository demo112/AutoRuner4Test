import path from 'path'
import { getDb } from '../db/client'
import type { WorkspaceTemplate, WorkspaceSession, Stage, StageState, ComponentRef } from '../db/schema'
import { getTemplate } from './workspace-template-service'
import { getComponent } from './component-registry'
import {
  startClaudeInstance,
  getInstanceStatus,
  canStartInstance,
} from './claude-instance'
import {
  broadcastStageChanged,
  broadcastReviewNeeded,
  broadcastSessionCompleted,
  broadcastSessionFailed,
} from '../ws/handler'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-executor')

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 10 * 60 * 1000 // 10 min per stage

// --- DB helpers ---

function rowToSession(row: Record<string, unknown>): WorkspaceSession {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    template_version: row.version as number,
    status: row.status as WorkspaceSession['status'],
    current_stage: (row.current_stage as string) || null,
    input: JSON.parse((row.input as string) || '{}'),
    context: JSON.parse((row.context as string) || '{}'),
    stage_states: JSON.parse((row.stage_states as string) || '{}'),
    created_by: row.created_by as string,
    started_at: (row.started_at as string) || null,
    completed_at: (row.completed_at as string) || null,
    created_at: row.created_at as string,
  }
}

function getSession(id: string): WorkspaceSession | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToSession(row) : null
}

function persistSession(session: WorkspaceSession): void {
  const db = getDb()
  db.prepare(
    'UPDATE workspace_sessions SET status = ?, current_stage = ?, context = ?, stage_states = ?, started_at = ?, completed_at = ? WHERE id = ?',
  ).run(
    session.status,
    session.current_stage,
    JSON.stringify(session.context),
    JSON.stringify(session.stage_states),
    session.started_at,
    session.completed_at,
    session.id,
  )
}

// --- Component resolution ---

interface ResolvedComponent {
  type: string
  name: string
  source: string
}

function resolveComponentRefs(
  globalRefs: ComponentRef[],
  stageToolbox: string[],
): ResolvedComponent[] {
  const seen = new Set<string>()
  const resolved: ResolvedComponent[] = []

  // 全局 toolbox + 阶段 toolbox，去重
  const allIds = [...globalRefs.map(r => r.component_id), ...stageToolbox]
  for (const id of allIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const comp = getComponent(id)
    if (comp && comp.installed) {
      resolved.push({ type: comp.type, name: comp.name, source: comp.source })
    } else {
      log.warn('component not found or not installed, skipping', { componentId: id })
    }
  }
  return resolved
}

// --- Config assembly ---

function assembleWorkspaceClaudeMd(
  template: WorkspaceTemplate,
  stage: Stage,
): string {
  const parts: string[] = []
  parts.push(`# Role\n${template.role}`)
  if (template.constraints.length > 0) {
    parts.push(`# Constraints\n${template.constraints.map(c => `- ${c}`).join('\n')}`)
  }
  parts.push(`# Current Stage: ${stage.name}\n${stage.description}`)
  parts.push(`## Output Spec\n${stage.output_spec}`)
  return parts.join('\n\n')
}

// --- Prompt construction ---

function buildStagePrompt(
  session: WorkspaceSession,
  stage: Stage,
): string {
  const parts: string[] = []
  parts.push('## Input')
  parts.push(JSON.stringify(session.input, null, 2))

  // 累积前序产出
  const previousOutputs = Object.entries(session.context)
  if (previousOutputs.length > 0) {
    parts.push('## Context (Previous Stage Outputs)')
    for (const [key, value] of previousOutputs) {
      parts.push(`### ${key}`)
      parts.push(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    }
  }

  parts.push('## Your Task')
  parts.push(`Execute stage "${stage.name}": ${stage.description}`)
  parts.push(`Produce output matching: ${stage.output_spec}`)

  return parts.join('\n\n')
}

// --- Polling ---

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForInstance(instanceId: string): Promise<{ success: boolean; output: string; error?: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const inst = getInstanceStatus(instanceId)
    if (!inst) {
      return { success: false, output: '', error: 'Instance not found' }
    }
    if (inst.status === 'completed') {
      return { success: true, output: inst.stdout }
    }
    if (inst.status === 'failed') {
      return { success: false, output: inst.stdout, error: inst.stderr || 'Process exited with non-zero code' }
    }
    await sleep(POLL_INTERVAL_MS)
  }
  return { success: false, output: '', error: 'Stage execution timed out' }
}

// --- Parse Claude CLI JSON output ---

function parseCliOutput(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw)
    // Claude CLI --output-format json wraps result in { result: "..." }
    if (parsed?.result && typeof parsed.result === 'string') {
      try { return JSON.parse(parsed.result) } catch { return parsed.result }
    }
    return parsed
  } catch {
    // Not JSON — return as plain string
    return raw.trim()
  }
}

// --- Core execution ---

export async function executeStage(
  sessionId: string,
  stageIndex: number,
): Promise<{ success: boolean; output?: unknown; error?: string }> {
  const session = getSession(sessionId)
  if (!session) return { success: false, error: 'Session not found' }

  const template = getTemplate(session.template_id)
  if (!template) return { success: false, error: 'Template not found' }

  const stage = template.stages[stageIndex]
  if (!stage) return { success: false, error: `Stage index ${stageIndex} out of range` }

  // Update stage_state to running
  const stageKey = stage.id
  const stageState: StageState = session.stage_states[stageKey] || {
    status: 'pending',
    started_at: '',
    completed_at: '',
    output: null,
  }
  stageState.status = 'running'
  stageState.started_at = new Date().toISOString()
  session.stage_states[stageKey] = stageState
  session.current_stage = stageKey
  persistSession(session)
  broadcastStageChanged(sessionId, stageKey, 'running')

  // Resolve components: global ∪ stage
  const resolvedComponents = resolveComponentRefs(template.toolbox, stage.toolbox)

  // Build config with CLAUDE.md content as a rule component
  const claudeMdContent = assembleWorkspaceClaudeMd(template, stage)
  const config: Record<string, any> = {
    _workspace_rules: claudeMdContent,
  }

  // Inject CLAUDE.md content via the rule mechanism
  const componentsWithRules = [
    ...resolvedComponents,
    { type: 'rule', name: '_workspace_rules', source: '' },
  ]

  // Construct prompt
  const prompt = buildStagePrompt(session, stage)

  // Wait for a free slot
  while (!canStartInstance()) {
    log.info('waiting for free instance slot', { sessionId, stageKey })
    await sleep(POLL_INTERVAL_MS)
  }

  // Start Claude CLI instance
  const taskId = `ws-${sessionId}-stage-${stageIndex}`
  const result = startClaudeInstance(
    taskId,
    'workspace-stage',
    componentsWithRules,
    config,
    prompt,
  )

  if (result.error || !result.instanceId) {
    stageState.status = 'failed'
    stageState.error = result.error || 'Failed to start instance'
    stageState.completed_at = new Date().toISOString()
    session.stage_states[stageKey] = stageState
    persistSession(session)
    broadcastSessionFailed(sessionId, stageKey, stageState.error)
    return { success: false, error: stageState.error }
  }

  // Wait for completion
  const execResult = await waitForInstance(result.instanceId)

  if (execResult.success) {
    const parsedOutput = parseCliOutput(execResult.output)
    if (stage.review_required) {
      stageState.status = 'waiting_review'
    } else {
      stageState.status = 'completed'
    }
    stageState.output = parsedOutput
    stageState.completed_at = new Date().toISOString()
    session.stage_states[stageKey] = stageState
    // Append output to cumulative context
    session.context[stageKey] = parsedOutput
    persistSession(session)
    if (stageState.status === 'waiting_review') {
      broadcastReviewNeeded(sessionId, stageKey, parsedOutput)
    } else {
      broadcastStageChanged(sessionId, stageKey, 'completed')
    }
    return { success: true, output: parsedOutput }
  } else {
    stageState.status = 'failed'
    stageState.error = execResult.error
    stageState.completed_at = new Date().toISOString()
    session.stage_states[stageKey] = stageState
    persistSession(session)
    broadcastSessionFailed(sessionId, stageKey, execResult.error || 'Unknown error')
    return { success: false, error: execResult.error }
  }
}

// --- Run full session (serial stage execution) ---

export async function runSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) { log.error('session not found', { sessionId }); return }
  if (session.status !== 'pending' && session.status !== 'paused') {
    log.info('session not runnable', { sessionId, status: session.status })
    return
  }

  const template = getTemplate(session.template_id)
  if (!template) {
    log.error('template not found', { templateId: session.template_id })
    session.status = 'failed'
    persistSession(session)
    return
  }

  session.status = 'running'
  session.started_at = session.started_at || new Date().toISOString()
  persistSession(session)
  broadcastStageChanged(sessionId, '', 'running')

  for (let i = 0; i < template.stages.length; i++) {
    const stage = template.stages[i]
    const stageKey = stage.id
    const existingState = session.stage_states[stageKey]

    // Skip already completed stages (e.g. on resume)
    if (existingState?.status === 'completed') continue

    // Hit a waiting_review stage — pause for human review
    if (existingState?.status === 'waiting_review') {
      session.status = 'paused'
      persistSession(session)
      broadcastReviewNeeded(sessionId, stageKey, existingState.output)
      log.info('session paused for review', { sessionId, stageKey })
      return
    }

    // Hit a failed stage — stop
    if (existingState?.status === 'failed') {
      session.status = 'failed'
      persistSession(session)
      broadcastSessionFailed(sessionId, stageKey, existingState.error || 'Stage failed')
      log.info('session stopped at failed stage', { sessionId, stageKey })
      return
    }

    // Execute the stage
    const result = await executeStage(sessionId, i)

    if (!result.success) {
      session.status = 'failed'
      persistSession(session)
      broadcastSessionFailed(sessionId, stageKey, result.error || 'Stage execution failed')
      log.info('session stopped at failed stage', { sessionId, stageKey })
      return
    }

    // Re-read session after stage execution (state was persisted inside executeStage)
    const updated = getSession(sessionId)
    if (!updated) break
    Object.assign(session, updated)

    // Stage completed with review_required — pause
    const stageState = session.stage_states[stageKey]
    if (stageState?.status === 'waiting_review') {
      session.status = 'paused'
      persistSession(session)
      broadcastReviewNeeded(sessionId, stageKey, stageState.output)
      log.info('session paused for review', { sessionId, stageKey })
      return
    }
  }

  // All stages completed
  session.status = 'completed'
  session.completed_at = new Date().toISOString()
  persistSession(session)
  broadcastSessionCompleted(sessionId)
  log.info('session completed', { sessionId })
}

// --- Review & Resume ---

export function reviewStage(
  sessionId: string,
  stageId: string,
  approved: boolean,
  comment?: string,
): { success: boolean } | { error: string } {
  const session = getSession(sessionId)
  if (!session) return { error: 'Session not found' }

  const stageState = session.stage_states[stageId]
  if (!stageState) return { error: 'Stage not found' }
  if (stageState.status !== 'waiting_review') return { error: 'Stage not waiting for review' }

  if (approved) {
    stageState.status = 'completed'
    stageState.review_result = 'approved'
  } else {
    stageState.status = 'failed'
    stageState.review_result = 'rejected'
  }
  stageState.review_comment = comment

  persistSession(session)
  if (approved) {
    broadcastStageChanged(sessionId, stageId, 'completed')
  } else {
    broadcastSessionFailed(sessionId, stageId, 'rejected')
  }
  return { success: true }
}

export async function resumeSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) return
  if (session.status !== 'paused') {
    log.info('session not resumable', { sessionId, status: session.status })
    return
  }
  await runSession(sessionId)
}

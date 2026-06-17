import path from 'path'
import fs from 'fs'
import type { ReviewGate, SegmentState, WorkspaceTemplate } from '../db/schema'
import { runClaudeSegment, assembleWorkspaceClaudeDir, buildSegmentPrompt } from './claude-instance'
import { broadcastGateReached, broadcastSessionCompleted, broadcastSessionFailed, broadcastSessionProgress } from '../ws/handler'
import * as sessionService from './workspace-session-service'
import * as templateService from './workspace-template-service'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-executor')
const WORKSPACE_BASE_DIR = process.env.WORKSPACE_BASE_DIR || path.join(process.cwd(), 'data', 'workspaces')

function getWorkspaceDir(sessionId: string): string {
  return path.join(WORKSPACE_BASE_DIR, sessionId)
}

function getTotalSegments(gates: ReviewGate[]): number {
  return gates.length + 1
}

function findCurrentSegmentIndex(segmentStates: Record<string, SegmentState>): number {
  for (const [key, state] of Object.entries(segmentStates)) {
    if (state.status === 'pending' || state.status === 'running') {
      const match = key.match(/^segment_(\d+)$/)
      if (match) return parseInt(match[1])
    }
  }
  return -1
}

function getGateAfterSegment(gates: ReviewGate[], segmentIndex: number): ReviewGate | null {
  if (segmentIndex < gates.length) return gates[segmentIndex]
  return null
}

export async function runSession(sessionId: string): Promise<void> {
  const session = sessionService.getSession(sessionId)
  if (!session) { log.error('session not found', { sessionId }); return }
  if (session.status !== 'pending' && session.status !== 'running') {
    log.info('session not runnable', { sessionId, status: session.status })
    return
  }

  const template = templateService.getTemplate(session.template_id)
  if (!template) {
    log.error('template not found', { templateId: session.template_id })
    sessionService.updateSessionStatus(sessionId, 'failed', { error: 'Template not found' })
    broadcastSessionFailed(sessionId, 'Template not found')
    return
  }

  // Start session if pending
  if (session.status === 'pending') {
    sessionService.startSession(sessionId)
  }

  const gates = template.review_gates as unknown as ReviewGate[]
  const totalSegments = getTotalSegments(gates)
  const workDir = getWorkspaceDir(sessionId)

  // Assemble .claude/ directory
  fs.mkdirSync(workDir, { recursive: true })
  assembleWorkspaceClaudeDir(workDir, template as unknown as Parameters<typeof assembleWorkspaceClaudeDir>[1])

  // Segment execution loop
  while (true) {
    const currentSession = sessionService.getSession(sessionId)
    if (!currentSession) { log.error('session lost', { sessionId }); return }

    const segmentStates = currentSession.segment_states as unknown as Record<string, SegmentState>
    const context = currentSession.context as unknown as Record<string, unknown>
    const input = currentSession.input as unknown as Record<string, unknown>

    const segIndex = findCurrentSegmentIndex(segmentStates)
    if (segIndex === -1) {
      // All segments done
      sessionService.updateSessionStatus(sessionId, 'completed', { output: context })
      broadcastSessionCompleted(sessionId, context)
      log.info('session completed', { sessionId })
      return
    }

    const segKey = `segment_${segIndex}`

    // Mark segment running
    sessionService.updateSegmentState(sessionId, segKey, {
      status: 'running',
      started_at: new Date().toISOString(),
    })
    broadcastSessionProgress(sessionId, segIndex, totalSegments)

    // Check if there's a gate after this segment
    const gate = getGateAfterSegment(gates, segIndex)

    // Build prompt with review feedback from last rejection if any
    const lastReview = currentSession.review_history as unknown as Array<{ gateId: string; result: 'approved' | 'rejected'; comment: string }>
    const lastRejection = lastReview.length > 0 && lastReview[lastReview.length - 1].result === 'rejected'
      ? lastReview[lastReview.length - 1]
      : null

    const prompt = buildSegmentPrompt({
      claudeMd: template.claude_md,
      input,
      context,
      segmentIndex: segIndex,
      totalSegments,
      reviewFeedback: lastRejection ? { result: lastRejection.result, comment: lastRejection.comment } : null,
    })

    // Execute segment
    const result = await runClaudeSegment(workDir, prompt)

    if (!result.success) {
      sessionService.updateSegmentState(sessionId, segKey, {
        status: 'failed',
        error: result.error || 'Segment execution failed',
        completed_at: new Date().toISOString(),
      })
      sessionService.updateSessionStatus(sessionId, 'failed', { error: result.error || 'Segment execution failed' })
      broadcastSessionFailed(sessionId, result.error || 'Segment execution failed')
      log.info('session failed at segment', { sessionId, segIndex, error: result.error })
      return
    }

    // Segment succeeded
    const output = result.output
    sessionService.updateSegmentState(sessionId, segKey, {
      status: 'completed',
      output,
      completed_at: new Date().toISOString(),
    })

    // Copy output to context
    context[segKey] = output
    sessionService.updateContext(sessionId, context)

    // Gate check: if gate exists after this segment, pause for review
    if (gate) {
      sessionService.updateSessionStatus(sessionId, 'waiting_review', { current_gate: gate.id })
      broadcastGateReached(sessionId, gate.id, gate.name, output)
      log.info('session paused at gate', { sessionId, gateId: gate.id, segIndex })
      return
    }

    // No gate — continue to next segment
    log.info('segment completed, continuing', { sessionId, segIndex })
  }
}

export async function continueAfterReview(sessionId: string, gateId: string, result: 'approved' | 'rejected', comment: string): Promise<void> {
  // Record the review
  sessionService.reviewSession(sessionId, gateId, result, comment)

  const session = sessionService.getSession(sessionId)
  if (!session) { log.error('session not found', { sessionId }); return }

  const template = templateService.getTemplate(session.template_id)
  if (!template) { log.error('template not found', { templateId: session.template_id }); return }

  const gates = template.review_gates as unknown as ReviewGate[]
  const gateIndex = gates.findIndex(g => g.id === gateId)
  // The segment that just completed is the one BEFORE the gate
  // gate at index i is after segment_i, so the next segment is segment_{i+1}
  const nextSegKey = `segment_${gateIndex + 1}`

  if (result === 'approved') {
    // Continue to next segment — mark session running
    sessionService.updateSessionStatus(sessionId, 'running', { current_gate: null })
    await runSession(sessionId)
  } else {
    // Rejected — reset the next segment to pending so it re-runs with feedback
    sessionService.updateSegmentState(sessionId, nextSegKey, {
      status: 'pending',
      started_at: '',
      completed_at: '',
      output: null,
      error: null,
    })
    sessionService.updateSessionStatus(sessionId, 'running', { current_gate: null })
    await runSession(sessionId)
  }
}

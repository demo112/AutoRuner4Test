import { getDb } from '../db/client'
import type { PipelineNode, PipelineEdge, NodeState } from '../db/schema'
import { getTemplate } from './pipeline-template-service'
import { broadcast } from '../ws/handler'
import { moduleLogger } from './logger'

const log = moduleLogger('pipeline-executor')

type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
type NodeStatus = NodeState['status']

const VALID_RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['paused', 'completed', 'failed', 'cancelled'],
  paused: ['running', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return VALID_RUN_TRANSITIONS[from]?.includes(to) ?? false
}

function resolveParams(
  paramMapping: Record<string, string>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, template] of Object.entries(paramMapping)) {
    const match = template.match(/^\{\{upstream:(.+?)\}\}$/)
    if (match) {
      const path = match[1]
      const parts = path.split('.')
      let value: unknown = context
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = (value as Record<string, unknown>)[part]
        } else {
          value = undefined
          break
        }
      }
      resolved[key] = value
    } else {
      resolved[key] = template
    }
  }
  return resolved
}

function findReadyNodes(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  nodeStates: Record<string, NodeState>,
): PipelineNode[] {
  const ready: PipelineNode[] = []

  for (const node of nodes) {
    if (nodeStates[node.id]?.status !== 'pending') continue

    const incomingEdges = edges.filter(e => e.to === node.id)

    if (incomingEdges.length === 0) {
      ready.push(node)
      continue
    }

    let allSatisfied = true
    for (const edge of incomingEdges) {
      const sourceState = nodeStates[edge.from]
      if (!sourceState) {
        allSatisfied = false
        break
      }

      if (edge.condition === 'success' && sourceState.status !== 'completed' && sourceState.status !== 'done') {
        allSatisfied = false
        break
      }
      if (edge.condition === 'failure' && sourceState.status !== 'failed') {
        allSatisfied = false
        break
      }
      if (edge.condition === 'always' && sourceState.status !== 'completed' && sourceState.status !== 'done' && sourceState.status !== 'failed') {
        allSatisfied = false
        break
      }
    }

    if (allSatisfied) ready.push(node)
  }

  return ready
}

async function executeComponent(
  componentId: string,
  componentType: string,
  params: Record<string, unknown>,
): Promise<{ artifacts: Record<string, unknown>; error?: string }> {
  log.info('executing component', { componentId, componentType })
  return { artifacts: { result: `output from ${componentId}` } }
}

function updateRunStatus(runId: string, status: RunStatus): void {
  const db = getDb()
  const now = (status === 'completed' || status === 'failed' || status === 'cancelled')
    ? new Date().toISOString()
    : null
  if (now) {
    db.prepare('UPDATE pipeline_runs SET status = ?, completed_at = ? WHERE id = ?').run(status, now, runId)
  } else {
    db.prepare('UPDATE pipeline_runs SET status = ? WHERE id = ?').run(status, runId)
  }
}

function persistRun(
  runId: string,
  nodeStates: Record<string, NodeState>,
  context: Record<string, unknown>,
  currentNodes: string[],
): void {
  const db = getDb()
  db.prepare('UPDATE pipeline_runs SET node_states = ?, context = ?, current_nodes = ? WHERE id = ?').run(
    JSON.stringify(nodeStates),
    JSON.stringify(context),
    JSON.stringify(currentNodes),
    runId,
  )
}

async function executeNode(
  runId: string,
  node: PipelineNode,
  nodeStates: Record<string, NodeState>,
  context: Record<string, unknown>,
): Promise<{ needsConfirmation: boolean }> {
  nodeStates[node.id].status = 'running'
  nodeStates[node.id].started_at = new Date().toISOString()
  persistRun(runId, nodeStates, context, [node.id])

  const resolvedParams = resolveParams(node.param_mapping, context)
  const finalParams = { ...node.params, ...resolvedParams }

  try {
    const result = await executeComponent(node.component_id, node.component_type, finalParams)
    context[node.id] = { artifacts: result.artifacts }
    nodeStates[node.id].outputs = { artifacts: result.artifacts }
    return { needsConfirmation: node.needs_confirmation }
  } catch (err) {
    nodeStates[node.id].error = (err as Error).message || String(err)
    throw err
  }
}

export async function executeRun(runId: string): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as Record<string, unknown> | undefined
  if (!row) { log.info('run not found', { runId }); return }
  if (row.status !== 'pending' && row.status !== 'paused') { log.info('run not executable', { runId, status: row.status as string }); return }

  const template = getTemplate(row.template_id as string)
  if (!template) { updateRunStatus(runId, 'failed'); return }

  const nodes = template.nodes
  const edges = template.edges
  const nodeStates: Record<string, NodeState> = JSON.parse((row.node_states as string) || '{}')
  const context: Record<string, unknown> = JSON.parse((row.context as string) || '{}')

  for (const node of nodes) {
    if (!nodeStates[node.id]) {
      nodeStates[node.id] = { status: 'pending', started_at: null, completed_at: null, outputs: {}, error: null, execution_log: null }
    }
  }

  const initialInput = JSON.parse((row.initial_input as string) || '{}')
  if (!context.initial_input) context.initial_input = initialInput

  updateRunStatus(runId, 'running')
  const startedAt = new Date().toISOString()
  db.prepare('UPDATE pipeline_runs SET started_at = COALESCE(started_at, ?) WHERE id = ?').run(startedAt, runId)

  while (true) {
    const readyNodes = findReadyNodes(nodes, edges, nodeStates)
    for (const node of readyNodes) { nodeStates[node.id].status = 'ready' }

    if (readyNodes.length === 0) {
      const hasWaiting = Object.values(nodeStates).some(s => s.status === 'waiting_confirmation')
      if (hasWaiting) {
        persistRun(runId, nodeStates, context, [])
        updateRunStatus(runId, 'paused')
        broadcast('pipeline:run:updated', runId, { status: 'paused' })
        return
      }
      const hasFailed = Object.values(nodeStates).some(s => s.status === 'failed')
      if (hasFailed) {
        persistRun(runId, nodeStates, context, [])
        updateRunStatus(runId, 'failed')
        broadcast('pipeline:run:updated', runId, { status: 'failed' })
        return
      }
      break
    }

    const currentIds = readyNodes.map(n => n.id)
    persistRun(runId, nodeStates, context, currentIds)

    const results = await Promise.allSettled(readyNodes.map(node => executeNode(runId, node, nodeStates, context)))

    for (const [i, result] of results.entries()) {
      const node = readyNodes[i]
      if (result.status === 'fulfilled') {
        if (result.value.needsConfirmation) {
          nodeStates[node.id].status = 'waiting_confirmation'
          broadcast('pipeline:run:confirmation_needed', runId, { nodeId: node.id, nodeName: node.name, outputs: nodeStates[node.id].outputs })
        } else {
          nodeStates[node.id].status = 'completed'
          nodeStates[node.id].completed_at = new Date().toISOString()
        }
      } else {
        nodeStates[node.id].status = 'failed'
        nodeStates[node.id].error = result.reason?.message || String(result.reason)
        nodeStates[node.id].completed_at = new Date().toISOString()
      }
      broadcast('pipeline:run:updated', runId, { nodeId: node.id, status: nodeStates[node.id].status })
    }

    persistRun(runId, nodeStates, context, [])
  }

  for (const node of nodes) {
    if (nodeStates[node.id].status === 'completed') nodeStates[node.id].status = 'done'
  }

  persistRun(runId, nodeStates, context, [])
  updateRunStatus(runId, 'completed')
  broadcast('pipeline:run:updated', runId, { status: 'completed' })
  log.info('run completed', { runId })
}

export function confirmNode(runId: string, nodeId: string, approved: boolean, comment?: string): { success: boolean } | { error: string } {
  const db = getDb()
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as Record<string, unknown> | undefined
  if (!row) return { error: '运行不存在' }
  if (row.status !== 'paused') return { error: '运行不在暂停状态' }

  const nodeStates: Record<string, NodeState> = JSON.parse((row.node_states as string) || '{}')
  const state = nodeStates[nodeId]
  if (!state) return { error: '节点不存在' }
  if (state.status !== 'waiting_confirmation') return { error: '节点不在等待确认状态' }

  if (approved) {
    nodeStates[nodeId].status = 'completed'
    nodeStates[nodeId].completed_at = new Date().toISOString()
    if (comment) nodeStates[nodeId].execution_log = (nodeStates[nodeId].execution_log || '') + `\n[确认] ${comment}`
  } else {
    nodeStates[nodeId].status = 'failed'
    nodeStates[nodeId].error = '人工拒绝'
    nodeStates[nodeId].completed_at = new Date().toISOString()
    if (comment) nodeStates[nodeId].execution_log = (nodeStates[nodeId].execution_log || '') + `\n[拒绝] ${comment}`
  }

  db.prepare('UPDATE pipeline_runs SET node_states = ? WHERE id = ?').run(JSON.stringify(nodeStates), runId)
  broadcast('pipeline:run:updated', runId, { nodeId, status: nodeStates[nodeId].status })
  return { success: true }
}

export async function resumeRun(runId: string): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as Record<string, unknown> | undefined
  if (!row || row.status !== 'paused') return
  broadcast('pipeline:run:updated', runId, { status: 'running' })
  await executeRun(runId)
}

export function cancelRun(runId: string): { success: boolean } | { error: string } {
  const db = getDb()
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as Record<string, unknown> | undefined
  if (!row) return { error: '运行不存在' }
  if (!canTransitionRun(row.status as RunStatus, 'cancelled')) return { error: `无法从 ${row.status as string} 状态取消` }
  updateRunStatus(runId, 'cancelled')
  broadcast('pipeline:run:updated', runId, { status: 'cancelled' })
  return { success: true }
}

export function retryNode(runId: string, nodeId: string): { success: boolean } | { error: string } {
  const db = getDb()
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as Record<string, unknown> | undefined
  if (!row) return { error: '运行不存在' }
  if (row.status !== 'failed' && row.status !== 'paused') return { error: '只能重试失败或暂停的运行中的节点' }

  const nodeStates: Record<string, NodeState> = JSON.parse((row.node_states as string) || '{}')
  const state = nodeStates[nodeId]
  if (!state) return { error: '节点不存在' }
  if (state.status !== 'failed') return { error: '只能重试失败的节点' }

  nodeStates[nodeId] = { status: 'pending', started_at: null, completed_at: null, outputs: {}, error: null, execution_log: null }

  db.prepare("UPDATE pipeline_runs SET node_states = ?, status = 'pending' WHERE id = ?").run(JSON.stringify(nodeStates), runId)
  broadcast('pipeline:run:updated', runId, { nodeId, status: 'pending' })
  return { success: true }
}

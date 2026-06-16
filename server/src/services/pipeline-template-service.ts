import { getDb } from '../db/client'
import type { PipelineTemplate, PipelineNode, PipelineEdge } from '../db/schema'
import { moduleLogger } from './logger'

const log = moduleLogger('pipeline-template-service')

interface CreateTemplateInput {
  name: string
  description?: string
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  is_public?: boolean
  created_by: string
}

interface UpdateTemplateInput {
  name?: string
  description?: string
  nodes?: PipelineNode[]
  edges?: PipelineEdge[]
  is_public?: boolean
}

function validateDAG(nodes: PipelineNode[], edges: PipelineEdge[]): string | null {
  if (nodes.length === 0) return '模板必须包含至少一个节点'

  const nodeIds = new Set(nodes.map(n => n.id))
  for (const node of nodes) {
    if (!node.id) return '节点缺少 id'
    if (!node.component_id) return `节点 ${node.id} 缺少 component_id`
    if (!node.name) return `节点 ${node.id} 缺少 name`
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) return `边引用了不存在的源节点 ${edge.from}`
    if (!nodeIds.has(edge.to)) return `边引用了不存在的目标节点 ${edge.to}`
    if (!['success', 'failure', 'always'].includes(edge.condition)) {
      return `边 ${edge.from}->${edge.to} 的 condition 无效: ${edge.condition}`
    }
  }

  // 检测环：DFS
  const adj = new Map<string, string[]>()
  for (const node of nodes) adj.set(node.id, [])
  for (const edge of edges) adj.get(edge.from)!.push(edge.to)

  const visited = new Set<string>()
  const inStack = new Set<string>()

  function hasCycle(nodeId: string): boolean {
    visited.add(nodeId)
    inStack.add(nodeId)
    for (const next of adj.get(nodeId)!) {
      if (!visited.has(next)) {
        if (hasCycle(next)) return true
      } else if (inStack.has(next)) {
        return true
      }
    }
    inStack.delete(nodeId)
    return false
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (hasCycle(node.id)) return 'DAG 中存在环，不允许循环依赖'
    }
  }

  return null
}

function rowToTemplate(row: Record<string, unknown>): PipelineTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || '',
    nodes: JSON.parse(row.nodes as string),
    edges: JSON.parse(row.edges as string),
    is_public: Boolean(row.is_public),
    created_by: row.created_by as string,
    version: row.version as number,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string) || null,
  }
}

export function listTemplates(filters?: { is_public?: boolean; created_by?: string }): PipelineTemplate[] {
  const db = getDb()
  let sql = 'SELECT * FROM pipeline_templates WHERE 1=1'
  const params: unknown[] = []

  if (filters?.is_public !== undefined) {
    sql += ' AND is_public = ?'
    params.push(filters.is_public ? 1 : 0)
  }
  if (filters?.created_by) {
    sql += ' AND created_by = ?'
    params.push(filters.created_by)
  }
  sql += ' ORDER BY updated_at DESC, created_at DESC'

  const rows = db.prepare(sql).all(...params as string[]) as Record<string, unknown>[]
  return rows.map(rowToTemplate)
}

export function getTemplate(id: string): PipelineTemplate | undefined {
  const db = getDb()
  const row = db.prepare('SELECT * FROM pipeline_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToTemplate(row) : undefined
}

export function createTemplate(input: CreateTemplateInput): PipelineTemplate | { error: string } {
  const validationError = validateDAG(input.nodes, input.edges)
  if (validationError) return { error: validationError }

  const db = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO pipeline_templates (id, name, description, nodes, edges, is_public, created_by, version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id,
    input.name,
    input.description || '',
    JSON.stringify(input.nodes),
    JSON.stringify(input.edges),
    input.is_public ? 1 : 0,
    input.created_by,
    now,
  )

  log.info('created template', { id, name: input.name })
  return getTemplate(id)!
}

export function updateTemplate(id: string, input: UpdateTemplateInput, userId: string): PipelineTemplate | { error: string } {
  const existing = getTemplate(id)
  if (!existing) return { error: '模板不存在' }
  if (existing.created_by !== userId) return { error: '只能修改自己创建的模板' }

  const newNodes = input.nodes ?? existing.nodes
  const newEdges = input.edges ?? existing.edges

  if (input.nodes || input.edges) {
    const validationError = validateDAG(newNodes, newEdges)
    if (validationError) return { error: validationError }
  }

  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE pipeline_templates
    SET name = ?, description = ?, nodes = ?, edges = ?, is_public = ?, version = version + 1, updated_at = ?
    WHERE id = ?
  `).run(
    input.name ?? existing.name,
    input.description ?? existing.description,
    JSON.stringify(newNodes),
    JSON.stringify(newEdges),
    (input.is_public ?? existing.is_public) ? 1 : 0,
    now,
    id,
  )

  log.info('updated template', { id, version: existing.version + 1 })
  return getTemplate(id)!
}

export function deleteTemplate(id: string, userId: string): { success: boolean } | { error: string } {
  const existing = getTemplate(id)
  if (!existing) return { error: '模板不存在' }
  if (existing.created_by !== userId) return { error: '只能删除自己创建的模板' }

  const db = getDb()
  const runs = db.prepare('SELECT id FROM pipeline_runs WHERE template_id = ? LIMIT 1').get(id)
  if (runs) return { error: '模板存在关联的流程运行，无法删除' }

  db.prepare('DELETE FROM pipeline_templates WHERE id = ?').run(id)
  log.info('deleted template', { id })
  return { success: true }
}

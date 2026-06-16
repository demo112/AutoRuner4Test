import { getDb } from '../db/client'
import type { WorkspaceTemplate, Stage, ComponentRef } from '../db/schema'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-template-service')

interface CreateTemplateInput {
  name: string
  description?: string
  role: string
  constraints?: string[]
  stages?: Stage[]
  toolbox?: ComponentRef[]
  is_public?: boolean
  created_by?: string
}

interface UpdateTemplateInput {
  name?: string
  description?: string
  role?: string
  constraints?: string[]
  stages?: Stage[]
  toolbox?: ComponentRef[]
  is_public?: boolean
}

function rowToTemplate(row: Record<string, unknown>): WorkspaceTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || '',
    role: row.role as string,
    constraints: JSON.parse((row.constraints as string) || '[]'),
    stages: JSON.parse((row.stages as string) || '[]'),
    toolbox: JSON.parse((row.toolbox as string) || '[]'),
    is_public: Boolean(row.is_public),
    version: row.version as number,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string) || null,
  }
}

export function listTemplates(publicOnly = false): WorkspaceTemplate[] {
  const db = getDb()
  const sql = publicOnly
    ? 'SELECT * FROM workspace_templates WHERE is_public = 1 ORDER BY updated_at DESC'
    : 'SELECT * FROM workspace_templates ORDER BY updated_at DESC'
  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return rows.map(rowToTemplate)
}

export function getTemplate(id: string): WorkspaceTemplate | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToTemplate(row) : null
}

export function createTemplate(data: CreateTemplateInput): WorkspaceTemplate {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const constraints = data.constraints || []
  const stages = data.stages || []
  const toolbox = data.toolbox || []

  db.prepare(`
    INSERT INTO workspace_templates (id, name, description, role, constraints, stages, toolbox, is_public, version, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description || '',
    data.role,
    JSON.stringify(constraints),
    JSON.stringify(stages),
    JSON.stringify(toolbox),
    data.is_public ? 1 : 0,
    data.created_by || 'operator',
    now,
    now,
  )

  log.info('created workspace template', { id, name: data.name })
  return getTemplate(id)!
}

export function updateTemplate(id: string, data: UpdateTemplateInput): WorkspaceTemplate | null {
  const existing = getTemplate(id)
  if (!existing) return null

  const db = getDb()
  const now = new Date().toISOString()

  const constraints = data.constraints ?? existing.constraints
  const stages = data.stages ?? existing.stages
  const toolbox = data.toolbox ?? existing.toolbox

  db.prepare(`
    UPDATE workspace_templates
    SET name = ?, description = ?, role = ?, constraints = ?, stages = ?, toolbox = ?, is_public = ?, version = version + 1, updated_at = ?
    WHERE id = ?
  `).run(
    data.name ?? existing.name,
    data.description ?? existing.description,
    data.role ?? existing.role,
    JSON.stringify(constraints),
    JSON.stringify(stages),
    JSON.stringify(toolbox),
    (data.is_public ?? existing.is_public) ? 1 : 0,
    now,
    id,
  )

  log.info('updated workspace template', { id, version: existing.version + 1 })
  return getTemplate(id)!
}

export function deleteTemplate(id: string): boolean {
  const existing = getTemplate(id)
  if (!existing) return false

  const db = getDb()
  const result = db.prepare('DELETE FROM workspace_templates WHERE id = ?').run(id)
  log.info('deleted workspace template', { id })
  return result.changes > 0
}

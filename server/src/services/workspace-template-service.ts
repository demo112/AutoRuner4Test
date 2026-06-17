import { getDb } from '../db/client'
import type { WorkspaceTemplate, ReviewGate } from '../db/schema'
import { moduleLogger } from './logger'

const log = moduleLogger('workspace-template-service')

// ── List ──────────────────────────────────────────────

export function listTemplates(filters?: { category?: string; starter?: boolean }): WorkspaceTemplate[] {
  const db = getDb()
  let sql = 'SELECT * FROM workspace_templates WHERE 1=1'
  const params: unknown[] = []

  if (filters?.category) {
    sql += ' AND category = ?'
    params.push(filters.category)
  }
  if (filters?.starter !== undefined) {
    sql += ' AND is_starter = ?'
    params.push(filters.starter ? 1 : 0)
  }

  sql += ' ORDER BY created_at DESC'

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToTemplate)
}

// ── Get ───────────────────────────────────────────────

export function getTemplate(id: string): WorkspaceTemplate | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM workspace_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToTemplate(row) : null
}

// ── Create ────────────────────────────────────────────

export interface CreateTemplateInput {
  name: string
  description?: string
  category?: string
  claude_md?: string
  skills?: string
  hooks?: string
  mcp_servers?: string
  rules?: string
  review_gates?: string
  input_schema?: string
  output_description?: string
  is_public?: number
  is_starter?: number
  created_by?: string
}

export function createTemplate(input: CreateTemplateInput): WorkspaceTemplate {
  const db = getDb()
  const id = `wt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  db.prepare(`
    INSERT INTO workspace_templates (id, name, description, category, claude_md, skills, hooks, mcp_servers, rules, review_gates, input_schema, output_description, is_public, is_starter, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.description || '',
    input.category || '',
    input.claude_md || '',
    input.skills || '[]',
    input.hooks || '[]',
    input.mcp_servers || '[]',
    input.rules || '[]',
    input.review_gates || '[]',
    input.input_schema || '{}',
    input.output_description || '',
    input.is_public ?? 0,
    input.is_starter ?? 0,
    input.created_by || null,
  )

  return getTemplate(id)!
}

// ── Update ────────────────────────────────────────────

export function updateTemplate(id: string, fields: Record<string, unknown>): WorkspaceTemplate | null {
  const db = getDb()
  const existing = getTemplate(id)
  if (!existing) return null

  const allowedKeys = [
    'name', 'description', 'category', 'claude_md', 'skills', 'hooks',
    'mcp_servers', 'rules', 'review_gates', 'input_schema', 'output_description',
    'is_public', 'is_starter',
  ]

  const setClauses: string[] = []
  const values: unknown[] = []

  for (const key of allowedKeys) {
    if (key in fields) {
      setClauses.push(`${key} = ?`)
      values.push(fields[key])
    }
  }

  if (setClauses.length === 0) return existing

  // Auto-increment version
  setClauses.push('version = version + 1')
  setClauses.push("updated_at = datetime('now')")

  values.push(id)

  db.prepare(`UPDATE workspace_templates SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

  return getTemplate(id)
}

// ── Delete ────────────────────────────────────────────

export function deleteTemplate(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM workspace_templates WHERE id = ?').run(id)
  return result.changes > 0
}

// ── Clone ─────────────────────────────────────────────

export function cloneTemplate(id: string, createdBy?: string): WorkspaceTemplate | null {
  const source = getTemplate(id)
  if (!source) return null

  return createTemplate({
    name: source.name + ' (副本)',
    description: source.description,
    category: source.category,
    claude_md: source.claude_md,
    skills: JSON.stringify(source.skills),
    hooks: JSON.stringify(source.hooks),
    mcp_servers: JSON.stringify(source.mcp_servers),
    rules: JSON.stringify(source.rules),
    review_gates: JSON.stringify(source.review_gates),
    input_schema: JSON.stringify(source.input_schema),
    output_description: source.output_description,
    is_public: source.is_public ? 1 : 0,
    is_starter: 0, // Cloned templates are not starters
    created_by: createdBy || null,
  })
}

// ── Preview .claude/ dir ──────────────────────────────

export function previewClaudeDir(id: string): { files: Array<{ path: string; content: string }> } | null {
  const template = getTemplate(id)
  if (!template) return null

  const files: Array<{ path: string; content: string }> = []

  files.push({ path: '.claude/CLAUDE.md', content: template.claude_md })

  if (template.skills.length > 0) {
    files.push({ path: '.claude/skills/', content: JSON.stringify(template.skills, null, 2) })
  }

  const settings: Record<string, unknown> = {}
  if (template.hooks.length > 0) settings.hooks = template.hooks
  if (template.mcp_servers.length > 0) settings.mcpServers = template.mcp_servers
  if (Object.keys(settings).length > 0) {
    files.push({ path: '.claude/settings.json', content: JSON.stringify(settings, null, 2) })
  }

  if (template.rules.length > 0) {
    files.push({ path: '.claude/rules/', content: JSON.stringify(template.rules, null, 2) })
  }

  return { files }
}

// ── Row mapper ────────────────────────────────────────

function rowToTemplate(row: Record<string, unknown>): WorkspaceTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    category: row.category as string,
    claude_md: row.claude_md as string,
    skills: JSON.parse((row.skills as string) || '[]'),
    hooks: JSON.parse((row.hooks as string) || '[]'),
    mcp_servers: JSON.parse((row.mcp_servers as string) || '[]'),
    rules: JSON.parse((row.rules as string) || '[]'),
    review_gates: JSON.parse((row.review_gates as string) || '[]'),
    input_schema: JSON.parse((row.input_schema as string) || '{}'),
    output_description: row.output_description as string,
    is_public: Boolean(row.is_public),
    is_starter: Boolean(row.is_starter),
    version: row.version as number,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string | null,
  }
}

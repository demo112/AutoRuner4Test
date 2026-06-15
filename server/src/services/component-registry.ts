import { getDb } from '../db/client'
import type { Component } from '../db/schema'
import { moduleLogger } from './logger'

const log = moduleLogger('component-registry')

export function listComponents(type?: string, installedOnly?: boolean): Component[] {
  const db = getDb()
  let sql = 'SELECT * FROM components WHERE 1=1'
  const params: string[] = []
  if (type) {
    sql += ' AND type = ?'
    params.push(type)
  }
  if (installedOnly) {
    sql += ' AND installed = 1'
  }
  sql += ' ORDER BY created_at DESC'
  return db.prepare(sql).all(...params) as Component[]
}

export function getComponent(id: string): Component | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM components WHERE id = ?').get(id) as Component | undefined
}

export function installComponent(data: {
  name: string
  type: 'skill' | 'hook' | 'mcp' | 'rule'
  version?: string
  description?: string
  author?: string
  config_schema?: Record<string, any>
  dependencies?: string[]
  source: string
}): Component {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO components (id, name, type, version, description, author, config_schema, dependencies, source, installed, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(
    id, data.name, data.type, data.version || '0.1.0',
    data.description || '', data.author || '',
    JSON.stringify(data.config_schema || {}),
    JSON.stringify(data.dependencies || []),
    data.source, now, now
  )
  const comp = getComponent(id)
  if (!comp) throw new Error('Failed to retrieve installed component')
  log.info('Component installed', { id, name: data.name, type: data.type })
  return comp
}

export function uninstallComponent(id: string): boolean {
  const db = getDb()
  const existing = getComponent(id)
  if (!existing) return false
  db.prepare('UPDATE components SET installed = 0, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
  log.info('Component uninstalled', { id: existing.name })
  return true
}

export function updateComponentConfig(id: string, config: Record<string, any>): Component | undefined {
  const db = getDb()
  const existing = getComponent(id)
  if (!existing) return undefined
  db.prepare('UPDATE components SET config_schema = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(config), new Date().toISOString(), id)
  return getComponent(id)
}

export function getComponentSchema(id: string): Record<string, any> | undefined {
  const comp = getComponent(id)
  if (!comp) return undefined
  try {
    return JSON.parse(comp.config_schema)
  } catch {
    return {}
  }
}

export function toggleComponent(id: string, enabled: boolean): Component | undefined {
  const db = getDb()
  const existing = getComponent(id)
  if (!existing) return undefined
  db.prepare('UPDATE components SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, new Date().toISOString(), id)
  return getComponent(id)
}

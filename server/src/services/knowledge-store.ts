import path from 'path'
import fs from 'fs'
import { getDb } from '../db/client'
import type { Knowledge } from '../db/schema'

const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || path.join(process.cwd(), 'data', 'knowledge')

function ensureDir(): void {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true })
}

function writeObsidianFile(id: string, title: string, type: string, content: string, tags: string[]): void {
  ensureDir()
  const frontmatter = [
    '---',
    `id: ${id}`,
    `type: ${type}`,
    `tags: [${tags.join(', ')}]`,
    `updated: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n')
  fs.writeFileSync(path.join(KNOWLEDGE_DIR, `${id}.md`), frontmatter + content, 'utf-8')
}

export function createKnowledge(data: {
  type: Knowledge['type']
  title: string
  content?: string
  tags?: string[]
  source_task_id?: string
}): Knowledge {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const tags = data.tags ?? []
  const tagsJson = JSON.stringify(tags)
  const content = data.content ?? ''

  const db = getDb()
  db.prepare(`
    INSERT INTO knowledge (id, type, source_task_id, title, content, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.type, data.source_task_id ?? null, data.title, content, tagsJson, now, now)

  writeObsidianFile(id, data.title, data.type, content, tags)

  return {
    id,
    type: data.type,
    source_task_id: data.source_task_id ?? null,
    title: data.title,
    content,
    tags: tagsJson,
    created_at: now,
    updated_at: now,
  }
}

export function getKnowledge(id: string): Knowledge | null {
  const db = getDb()
  return db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id) as Knowledge | null
}

export function listKnowledge(type?: string, tag?: string): Knowledge[] {
  const db = getDb()
  let sql = 'SELECT * FROM knowledge WHERE 1=1'
  const params: any[] = []

  if (type) {
    sql += ' AND type = ?'
    params.push(type)
  }
  if (tag) {
    sql += ' AND tags LIKE ?'
    params.push(`%"${tag}"%`)
  }

  sql += ' ORDER BY updated_at DESC'
  return db.prepare(sql).all(...params) as Knowledge[]
}

export function updateKnowledge(id: string, data: {
  title?: string
  content?: string
  tags?: string[]
  type?: Knowledge['type']
}): Knowledge | null {
  const existing = getKnowledge(id)
  if (!existing) return null

  const title = data.title ?? existing.title
  const content = data.content ?? existing.content
  const tags = data.tags ?? JSON.parse(existing.tags)
  const tagsJson = JSON.stringify(tags)
  const type = data.type ?? existing.type
  const now = new Date().toISOString()

  const db = getDb()
  db.prepare(`
    UPDATE knowledge SET title = ?, content = ?, tags = ?, type = ?, updated_at = ? WHERE id = ?
  `).run(title, content, tagsJson, type, now, id)

  writeObsidianFile(id, title, type, content, tags)

  return { ...existing, title, content, tags: tagsJson, type, updated_at: now }
}

export function searchKnowledge(query: string): Knowledge[] {
  const db = getDb()
  const pattern = `%${query}%`
  return db.prepare(
    'SELECT * FROM knowledge WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC'
  ).all(pattern, pattern) as Knowledge[]
}

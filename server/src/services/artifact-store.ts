import path from 'path'
import fs from 'fs'
import { getDb } from '../db/client'
import type { Artifact } from '../db/schema'

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || path.join(process.cwd(), 'data', 'artifacts')

function ensureDir(): void {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
}

export function saveArtifact(taskId: string, name: string, type: string, content: string): string {
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('Artifact name must not contain path separators or parent directory references')
  }
  ensureDir()
  const id = crypto.randomUUID()
  const taskDir = path.join(ARTIFACTS_DIR, taskId)
  fs.mkdirSync(taskDir, { recursive: true })
  const filePath = path.join(taskDir, name)
  fs.writeFileSync(filePath, content, 'utf-8')

  const db = getDb()
  db.prepare(`
    INSERT INTO artifacts (id, task_id, name, type, file_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, taskId, name, type, filePath, new Date().toISOString())

  // 更新任务的 output_artifact_id
  db.prepare('UPDATE tasks SET output_artifact_id = ?, updated_at = ? WHERE id = ?')
    .run(id, new Date().toISOString(), taskId)

  return id
}

export function getArtifact(id: string): { name: string; content: string; type: string } | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as any
  if (!row) return null
  const content = fs.readFileSync(row.file_path, 'utf-8')
  return { name: row.name, content, type: row.type }
}

export function getArtifactsByTask(taskId: string): Pick<Artifact, 'id' | 'name' | 'type' | 'created_at'>[] {
  const db = getDb()
  return db.prepare('SELECT id, name, type, created_at FROM artifacts WHERE task_id = ?').all(taskId) as Pick<Artifact, 'id' | 'name' | 'type' | 'created_at'>[]
}

import { Database } from 'bun:sqlite'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'db', 'autoruner.db')

let db: Database | null = null

export function getDb(): Database {
  if (!db) {
    const dir = path.dirname(DB_PATH)
    fs.mkdirSync(dir, { recursive: true })
    db = new Database(DB_PATH)
    db.run('PRAGMA journal_mode = WAL')
    db.run('PRAGMA foreign_keys = ON')
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

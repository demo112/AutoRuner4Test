import { getDb } from './client'
import {
  CREATE_COMPONENTS_TABLE,
  CREATE_TASKS_TABLE,
  CREATE_ARTIFACTS_TABLE,
  CREATE_KNOWLEDGE_TABLE,
  CREATE_KNOWLEDGE_LINKS_TABLE,
} from './schema'

export function migrate(): void {
  const db = getDb()
  db.exec(CREATE_COMPONENTS_TABLE)
  db.exec(CREATE_TASKS_TABLE)
  db.exec(CREATE_ARTIFACTS_TABLE)
  db.exec(CREATE_KNOWLEDGE_TABLE)
  db.exec(CREATE_KNOWLEDGE_LINKS_TABLE)
  console.log('Database migration complete')
}

import { getDb } from './client'
import {
  CREATE_COMPONENTS_TABLE,
  CREATE_TASKS_TABLE,
  CREATE_ARTIFACTS_TABLE,
  CREATE_KNOWLEDGE_TABLE,
  CREATE_KNOWLEDGE_LINKS_TABLE,
  CREATE_USERS_TABLE,
  CREATE_CREDENTIALS_TABLE,
  CREATE_WORKSPACE_TEMPLATES_TABLE,
  CREATE_WORKSPACE_SESSIONS_TABLE,
} from './schema'
import { moduleLogger } from '../services/logger'

const log = moduleLogger('migrate')

export function migrate(): void {
  const db = getDb()
  db.exec(CREATE_COMPONENTS_TABLE)
  db.exec(CREATE_TASKS_TABLE)
  db.exec(CREATE_ARTIFACTS_TABLE)
  db.exec(CREATE_KNOWLEDGE_TABLE)
  db.exec(CREATE_KNOWLEDGE_LINKS_TABLE)
  db.exec(CREATE_USERS_TABLE)
  db.exec(CREATE_CREDENTIALS_TABLE)
  db.exec(CREATE_WORKSPACE_TEMPLATES_TABLE)
  db.exec(CREATE_WORKSPACE_SESSIONS_TABLE)
  log.info('Database migration complete')
}

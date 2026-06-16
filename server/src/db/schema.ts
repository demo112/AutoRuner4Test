export interface Component {
  id: string
  name: string
  type: 'skill' | 'hook' | 'mcp' | 'rule'
  version: string
  description: string
  author: string
  config_schema: string          // JSON string
  dependencies: string           // JSON string, array of component ids
  source: string
  installed: number              // 0 or 1
  enabled: number                // 0 or 1
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  type: 'requirement-analysis' | 'testcase-generation' | 'script-conversion' | 'execution-analysis' | 'issue-triage'
  status: 'pending' | 'running' | 'review' | 'approved' | 'completed' | 'failed'
  component_ids: string          // JSON string, array of component ids
  config: string                 // JSON string
  input_artifact_id: string | null
  output_artifact_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface Artifact {
  id: string
  task_id: string
  name: string
  type: string                   // 对应 task type
  file_path: string
  created_at: string
}

export interface Knowledge {
  id: string
  type: 'pattern' | 'lesson' | 'defect_pattern' | 'script_template'
  source_task_id: string | null
  title: string
  content: string                // Markdown
  tags: string                   // JSON string
  created_at: string
  updated_at: string
}

export const CREATE_COMPONENTS_TABLE = `
CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('skill', 'hook', 'mcp', 'rule')),
  version TEXT NOT NULL DEFAULT '0.1.0',
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  config_schema TEXT NOT NULL DEFAULT '{}',
  dependencies TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT '',
  installed INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`

export const CREATE_TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('requirement-analysis', 'testcase-generation', 'script-conversion', 'execution-analysis', 'issue-triage')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'review', 'approved', 'completed', 'failed')),
  component_ids TEXT NOT NULL DEFAULT '[]',
  config TEXT NOT NULL DEFAULT '{}',
  input_artifact_id TEXT,
  output_artifact_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`

export const CREATE_ARTIFACTS_TABLE = `
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`

export const CREATE_KNOWLEDGE_TABLE = `
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('pattern', 'lesson', 'defect_pattern', 'script_template')),
  source_task_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`

export const CREATE_KNOWLEDGE_LINKS_TABLE = `
CREATE TABLE IF NOT EXISTS knowledge_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'related',
  strength REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, relation_type)
)
`

export const CREATE_USERS_TABLE = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
)
`

export interface PipelineNode {
  id: string
  name: string
  component_id: string
  component_type: 'skill' | 'mcp' | 'hook' | 'rule'
  params: Record<string, unknown>
  needs_confirmation: boolean
  param_mapping: Record<string, string>
}

export interface PipelineEdge {
  from: string
  to: string
  condition: 'success' | 'failure' | 'always'
}

export interface PipelineTemplate {
  id: string
  name: string
  description: string
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  is_public: boolean
  created_by: string
  version: number
  created_at: string
  updated_at: string | null
}

export interface NodeState {
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'waiting_confirmation' | 'done'
  started_at: string | null
  completed_at: string | null
  outputs: Record<string, unknown>
  error: string | null
  execution_log: string | null
}

export interface PipelineRun {
  id: string
  template_id: string
  template_version: number
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  context: Record<string, unknown>
  node_states: Record<string, NodeState>
  current_nodes: string[]
  initial_input: Record<string, unknown>
  started_at: string | null
  completed_at: string | null
  created_by: string
  created_at: string
}

export const CREATE_PIPELINE_TEMPLATES_TABLE = `
CREATE TABLE IF NOT EXISTS pipeline_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  nodes TEXT NOT NULL DEFAULT '[]',
  edges TEXT NOT NULL DEFAULT '[]',
  is_public INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
)
`

export const CREATE_PIPELINE_RUNS_TABLE = `
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES pipeline_templates(id),
  template_version INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  context TEXT DEFAULT '{}',
  node_states TEXT DEFAULT '{}',
  current_nodes TEXT DEFAULT '[]',
  initial_input TEXT DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)
`

export const CREATE_CREDENTIALS_TABLE = `
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL,
  key_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(component_id, key_name),
  FOREIGN KEY (component_id) REFERENCES components(id)
)
`

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

// Workspace Orchestration 类型

export interface ComponentRef {
  component_id: string
  source?: string  // "local" | "aimarket://<id>"
}

export interface Stage {
  id: string
  name: string
  description: string
  toolbox: string[]        // 阶段特有组件 ID（叠加到全局工具箱）
  output_spec: string      // 期望产出描述
  review_required: boolean // 是否强制人工审核
}

export interface WorkspaceTemplate {
  id: string
  name: string
  description: string
  role: string               // AI 在此环境中的角色定义
  constraints: string[]      // 硬性约束规则
  stages: Stage[]            // 有序阶段列表
  toolbox: ComponentRef[]    // 全局组件
  is_public: boolean
  version: number
  created_by: string
  created_at: string
  updated_at: string | null
}

export interface StageState {
  status: 'pending' | 'running' | 'waiting_review' | 'completed' | 'failed'
  started_at: string
  completed_at: string
  output: any
  review_result?: 'approved' | 'rejected'
  review_comment?: string
  error?: string
}

export interface WorkspaceSession {
  id: string
  template_id: string
  template_version: number
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  current_stage: string | null
  input: Record<string, unknown>      // 用户初始输入
  context: Record<string, unknown>    // 累积阶段产出
  stage_states: Record<string, StageState>
  created_by: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export const CREATE_WORKSPACE_TEMPLATES_TABLE = `
CREATE TABLE IF NOT EXISTS workspace_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  role TEXT NOT NULL,
  constraints TEXT NOT NULL,     -- JSON string[]
  stages TEXT NOT NULL,          -- JSON Stage[]
  toolbox TEXT NOT NULL,         -- JSON ComponentRef[]
  is_public INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)
`

export const CREATE_WORKSPACE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS workspace_sessions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES workspace_templates(id),
  template_version INTEGER,
  status TEXT DEFAULT 'pending',
  current_stage TEXT,
  input TEXT NOT NULL,            -- JSON
  context TEXT DEFAULT '{}',      -- JSON
  stage_states TEXT DEFAULT '{}', -- JSON Record<string, StageState>
  created_by TEXT,
  started_at TEXT,
  completed_at TEXT,
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

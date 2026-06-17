// ── Workspace V2 类型 ──────────────────────────────────

export interface ReviewGate {
  id: string
  name: string
  description: string
}

export interface ComponentRef { component_id: string }
export interface HookConfig { event: string; matcher?: string; command: string }
export interface McpConfig { name: string; command: string; args?: string[]; env?: Record<string, string> }
export interface RuleRef { component_id: string }

export interface WorkspaceTemplate {
  id: string
  name: string
  description: string
  category: string
  claude_md: string
  skills: ComponentRef[]
  hooks: HookConfig[]
  mcp_servers: McpConfig[]
  rules: RuleRef[]
  review_gates: ReviewGate[]
  input_schema: Record<string, unknown>
  output_description: string
  is_public: boolean
  is_starter: boolean
  version: number
  created_by: string | null
  created_at: string
  updated_at: string | null
}

export interface ReviewRecord {
  gateId: string
  result: 'approved' | 'rejected'
  comment: string
  reviewed_at: string
}

export interface SegmentState {
  status: string
  started_at?: string
  completed_at?: string
  output?: unknown
  error?: string | null
}

export interface WorkspaceSession {
  id: string
  template_id: string
  template_version: number | null
  status: 'pending' | 'running' | 'waiting_review' | 'completed' | 'failed' | 'cancelled'
  current_gate: string | null
  input: Record<string, unknown>
  output: unknown
  segment_states: Record<string, SegmentState>
  review_history: ReviewRecord[]
  error: string | null
  created_by: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface ClaudeDirPreview {
  files: Array<{ path: string; content: string }>
}

// ── API ────────────────────────────────────────────────

const BASE = '/api'

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  components: {
    list: (type?: string, installed?: boolean) =>
      request<{ components: any[] }>(`/components${type ? `?type=${type}` : ''}${installed ? `${type ? '&' : '?'}installed=true` : ''}`),
    get: (id: string) => request<{ component: any }>(`/components/${id}`),
    install: (data: any) => request<{ component: any }>('/components/install', { method: 'POST', body: JSON.stringify(data) }),
    uninstall: (id: string) => request<{ ok: boolean }>(`/components/${id}`, { method: 'DELETE' }),
    updateConfig: (id: string, config: any) => request<{ component: any }>(`/components/${id}/config`, { method: 'PUT', body: JSON.stringify(config) }),
    getSchema: (id: string) => request<{ schema: any }>(`/components/${id}/schema`),
    toggle: (id: string, enabled: boolean) => request<{ component: any }>(`/components/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  },
  tasks: {
    list: (type?: string, status?: string) =>
      request<{ tasks: any[] }>(`/tasks${type ? `?type=${type}` : ''}${status ? `${type ? '&' : '?'}status=${status}` : ''}`),
    get: (id: string) => request<{ task: any }>(`/tasks/${id}`),
    create: (data: any) => request<{ task: any }>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    start: (id: string) => request<{ task: any }>(`/tasks/${id}/start`, { method: 'POST' }),
    approve: (id: string) => request<{ task: any }>(`/tasks/${id}/approve`, { method: 'POST' }),
    reject: (id: string) => request<{ task: any }>(`/tasks/${id}/reject`, { method: 'POST' }),
    retry: (id: string) => request<{ task: any }>(`/tasks/${id}/retry`, { method: 'POST' }),
    getArtifacts: (id: string) => request<{ artifacts: any[] }>(`/tasks/${id}/artifacts`),
    getArtifact: (taskId: string, artifactId: string) => request<{ name: string; content: string; type: string }>(`/tasks/${taskId}/artifact?artifact_id=${artifactId}`),
  },
  knowledge: {
    list: (type?: string, tag?: string) =>
      request<{ items: any[] }>(`/knowledge${type ? `?type=${type}` : ''}${tag ? `${type ? '&' : '?'}tag=${tag}` : ''}`),
    get: (id: string) => request<{ item: any }>(`/knowledge/${id}`),
    create: (data: any) => request<{ item: any }>('/knowledge', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<{ item: any }>(`/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    search: (q: string) => request<{ items: any[] }>(`/knowledge/search?q=${encodeURIComponent(q)}`),
    distill: (taskId?: string) => request<{ distilled: number; items: any[] }>('/knowledge/distill', { method: 'POST', body: JSON.stringify({ task_id: taskId }) }),
    distillStatus: () => request<{ unprocessed_count: number; needs_distillation: boolean }>('/knowledge/distill/status'),
    getRelated: (id: string) => request<{ related: any[] }>(`/knowledge/${id}/related`),
    recommend: (type: string, tags: string[]) => request<{ recommendations: any[] }>(`/knowledge/recommend?type=${type}&tags=${tags.join(',')}`),
    buildGraph: () => request<{ links_created: number }>('/knowledge/graph/build', { method: 'POST' }),
  },

  // ── Workspace V2 ────────────────────────────────────

  workspaceTemplates: {
    list: (filters?: { category?: string; starter?: boolean }) =>
      request<{ templates: WorkspaceTemplate[] }>('/workspace-templates' + (filters ? `?${new URLSearchParams(Object.entries(filters).filter(([,v]) => v !== undefined).map(([k,v]) => [k, String(v)])).toString()}` : '')),
    get: (id: string) =>
      request<{ template: WorkspaceTemplate }>(`/workspace-templates/${id}`),
    create: (data: {
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
    }) => request<{ template: WorkspaceTemplate }>('/workspace-templates', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<{ template: WorkspaceTemplate }>(`/workspace-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    clone: (id: string, createdBy?: string) =>
      request<{ template: WorkspaceTemplate }>(`/workspace-templates/${id}/clone`, { method: 'POST', body: JSON.stringify({ created_by: createdBy }) }),
    preview: (id: string) =>
      request<{ preview: ClaudeDirPreview }>(`/workspace-templates/${id}/preview`),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/workspace-templates/${id}`, { method: 'DELETE' }),
  },

  workspaceSessions: {
    list: () =>
      request<{ sessions: WorkspaceSession[] }>('/workspace-sessions'),
    get: (id: string) =>
      request<{ session: WorkspaceSession }>(`/workspace-sessions/${id}`),
    create: (data: { template_id: string; input?: Record<string, unknown>; created_by?: string }) =>
      request<{ session: WorkspaceSession }>('/workspace-sessions', { method: 'POST', body: JSON.stringify(data) }),
    start: (id: string) =>
      request<{ session: WorkspaceSession }>(`/workspace-sessions/${id}/start`, { method: 'POST' }),
    review: (id: string, gateId: string, result: 'approved' | 'rejected', comment?: string) =>
      request<{ session: WorkspaceSession }>(`/workspace-sessions/${id}/review/${gateId}`, {
        method: 'POST',
        body: JSON.stringify({ result, comment }),
      }),
    retry: (id: string, gateId: string) =>
      request<{ session: WorkspaceSession }>(`/workspace-sessions/${id}/retry/${gateId}`, { method: 'POST' }),
    cancel: (id: string) =>
      request<{ session: WorkspaceSession }>(`/workspace-sessions/${id}/cancel`, { method: 'POST' }),
  },
}

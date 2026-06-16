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

// Components
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
  workspaceTemplates: {
    list: (publicOnly = false) =>
      fetch(`/api/workspace-templates${publicOnly ? '?public=true' : ''}`).then(r => r.json()),
    get: (id: string) =>
      fetch(`/api/workspace-templates/${id}`).then(r => r.json()),
    create: (data: any) =>
      fetch('/api/workspace-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    update: (id: string, data: any) =>
      fetch(`/api/workspace-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    delete: (id: string) =>
      fetch(`/api/workspace-templates/${id}`, { method: 'DELETE' }).then(r => r.json()),
  },

  workspaceSessions: {
    list: () =>
      fetch('/api/workspace-sessions').then(r => r.json()),
    get: (id: string) =>
      fetch(`/api/workspace-sessions/${id}`).then(r => r.json()),
    create: (data: any) =>
      fetch('/api/workspace-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    start: (id: string) =>
      fetch(`/api/workspace-sessions/${id}/start`, { method: 'POST' }).then(r => r.json()),
    review: (id: string, stageId: string, approved: boolean, comment?: string) =>
      fetch(`/api/workspace-sessions/${id}/review/${stageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, comment }),
      }).then(r => r.json()),
    retry: (id: string, stageId: string) =>
      fetch(`/api/workspace-sessions/${id}/retry/${stageId}`, { method: 'POST' }).then(r => r.json()),
    cancel: (id: string) =>
      fetch(`/api/workspace-sessions/${id}/cancel`, { method: 'POST' }).then(r => r.json()),
  },
}

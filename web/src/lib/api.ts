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
  pipelineTemplates: {
    list: () => request<any[]>('/pipeline-templates'),
    get: (id: string) => request<any>(`/pipeline-templates/${id}`),
    create: (data: any) => request<any>('/pipeline-templates', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/pipeline-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ success: boolean }>(`/pipeline-templates/${id}`, { method: 'DELETE' }),
  },
  pipelineRuns: {
    list: () => request<any[]>('/pipeline-runs'),
    get: (id: string) => request<any>(`/pipeline-runs/${id}`),
    create: (data: any) => request<any>('/pipeline-runs', { method: 'POST', body: JSON.stringify(data) }),
    start: (id: string) => request<any>(`/pipeline-runs/${id}/start`, { method: 'POST' }),
    confirm: (id: string, nodeId: string, approved: boolean, comment?: string) =>
      request<{ success: boolean }>(`/pipeline-runs/${id}/confirm/${nodeId}`, { method: 'POST', body: JSON.stringify({ approved, comment }) }),
    cancel: (id: string) => request<{ success: boolean }>(`/pipeline-runs/${id}/cancel`, { method: 'POST' }),
    retry: (id: string, nodeId: string) => request<{ success: boolean }>(`/pipeline-runs/${id}/retry/${nodeId}`, { method: 'POST' }),
  },
}

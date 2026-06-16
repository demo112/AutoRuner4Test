import { create } from 'zustand'
import { api } from './api'

interface AppState {
  // Components
  components: any[]
  loadingComponents: boolean
  fetchComponents: (type?: string) => Promise<void>

  // Tasks
  tasks: any[]
  loadingTasks: boolean
  fetchTasks: (type?: string, status?: string) => Promise<void>
  updateTaskStatus: (taskId: string, status: string) => void

  // Review modal
  reviewTask: any | null
  setReviewTask: (task: any | null) => void

  // Knowledge
  knowledgeItems: any[]
  loadingKnowledge: boolean
  fetchKnowledge: (type?: string) => Promise<void>

  // Pipeline Templates
  pipelineTemplates: any[]
  loadingPipelineTemplates: boolean
  fetchPipelineTemplates: () => Promise<void>

  // Pipeline Runs
  pipelineRuns: any[]
  loadingPipelineRuns: boolean
  fetchPipelineRuns: () => Promise<void>
  updatePipelineRun: (runId: string, patch: Partial<any>) => void

export const useStore = create<AppState>((set) => ({
  // Components
  components: [],
  loadingComponents: false,
  fetchComponents: async (type?: string) => {
    set({ loadingComponents: true })
    try {
      const { components } = await api.components.list(type)
      set({ components })
    } finally {
      set({ loadingComponents: false })
    }
  },

  // Tasks
  tasks: [],
  loadingTasks: false,
  fetchTasks: async (type?: string, status?: string) => {
    set({ loadingTasks: true })
    try {
      const { tasks } = await api.tasks.list(type, status)
      set({ tasks })
    } finally {
      set({ loadingTasks: false })
    }
  },
  updateTaskStatus: (taskId, status) => {
    set((state) => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, status } : t),
    }))
  },

  // Review
  reviewTask: null,
  setReviewTask: (task) => set({ reviewTask: task }),

  // Knowledge
  knowledgeItems: [],
  loadingKnowledge: false,
  fetchKnowledge: async (type?: string) => {
    set({ loadingKnowledge: true })
    try {
      const { items } = await api.knowledge.list(type)
      set({ knowledgeItems: items })
    } finally {
      set({ loadingKnowledge: false })
    }
  },

  // Pipeline Templates
  pipelineTemplates: [],
  loadingPipelineTemplates: false,
  fetchPipelineTemplates: async () => {
    set({ loadingPipelineTemplates: true })
    try {
      const templates = await api.pipelineTemplates.list()
      set({ pipelineTemplates: Array.isArray(templates) ? templates : [] })
    } finally {
      set({ loadingPipelineTemplates: false })
    }
  },

  // Pipeline Runs
  pipelineRuns: [],
  loadingPipelineRuns: false,
  fetchPipelineRuns: async () => {
    set({ loadingPipelineRuns: true })
    try {
      const runs = await api.pipelineRuns.list()
      set({ pipelineRuns: Array.isArray(runs) ? runs : [] })
    } finally {
      set({ loadingPipelineRuns: false })
    }
  },
  updatePipelineRun: (runId, patch) => {
    set((state) => ({
      pipelineRuns: state.pipelineRuns.map(r => r.id === runId ? { ...r, ...patch } : r),
    }))
  },
}))

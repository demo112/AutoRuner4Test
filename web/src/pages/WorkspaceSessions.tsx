import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'

const STATUS_LABELS: Record<string, string> = {
  pending: '待执行',
  running: '执行中',
  waiting_review: '待审核',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  waiting_review: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const STAGE_DOT_COLORS: Record<string, string> = {
  pending: 'bg-gray-300',
  running: 'bg-blue-400 animate-pulse',
  waiting_review: 'bg-orange-400',
  completed: 'bg-green-400',
  failed: 'bg-red-400',
}

export default function WorkspaceSessions() {
  const { workspaceSessions, loadingWorkspaceSessions, fetchWorkspaceSessions, fetchWorkspaceTemplates, workspaceTemplates } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedSession, setSelectedSession] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkspaceSessions()
    fetchWorkspaceTemplates()
  }, [])

  if (loadingWorkspaceSessions) return <div className="p-6">加载中...</div>

  const session = selectedSession
    ? workspaceSessions.find((s: any) => s.id === selectedSession)
    : null

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">工作会话</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          启动会话
        </button>
      </div>

      {session ? (
        <SessionDetail
          session={session}
          templates={workspaceTemplates}
          onBack={() => setSelectedSession(null)}
          onRefresh={fetchWorkspaceSessions}
        />
      ) : (
        <div className="space-y-3">
          {workspaceSessions.map((s: any) => {
            const tpl = workspaceTemplates.find((t: any) => t.id === s.template_id)
            return (
              <div
                key={s.id}
                onClick={() => setSelectedSession(s.id)}
                className="border rounded-lg p-4 hover:shadow-sm cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{tpl?.name || s.template_id.slice(0, 8) + '...'}</h3>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      <span>v{s.template_version}</span>
                      <span>{s.created_by}</span>
                      <span>{s.created_at?.slice(0, 19).replace('T', ' ')}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[s.status] || 'bg-gray-100'}`}>
                    {STATUS_LABELS[s.status] || s.status}
                  </span>
                </div>
              </div>
            )
          })}
          {workspaceSessions.length === 0 && (
            <p className="text-gray-400 text-center py-8">暂无工作会话，点击上方按钮启动</p>
          )}
        </div>
      )}

      {showCreate && (
        <CreateSessionForm
          templates={workspaceTemplates}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchWorkspaceSessions() }}
        />
      )}
    </div>
  )
}

/* ---------- 会话详情 ---------- */

function SessionDetail({ session, templates, onBack, onRefresh }: {
  session: any
  templates: any[]
  onBack: () => void
  onRefresh: () => void
}) {
  const tpl = templates.find((t: any) => t.id === session.template_id)
  const stageStates: Record<string, any> = session.stage_states || {}
  const stages = tpl?.stages || []
  const waitingReviewStage = Object.entries(stageStates).find(
    ([, state]: [string, any]) => state.status === 'waiting_review'
  )

  const handleCancel = async () => {
    if (confirm('确定取消？')) {
      await api.workspaceSessions.cancel(session.id)
      onRefresh()
    }
  }

  const handleRetry = async (stageId: string) => {
    await api.workspaceSessions.retry(session.id, stageId)
    onRefresh()
  }

  const handleReview = async (stageId: string, approved: boolean, comment: string) => {
    await api.workspaceSessions.review(session.id, stageId, approved, comment)
    onRefresh()
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-3">← 返回列表</button>

      {/* 基本信息 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">会话详情</h3>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[session.status]}`}>
            {STATUS_LABELS[session.status] || session.status}
          </span>
          {(session.status === 'running' || session.status === 'paused') && (
            <button onClick={handleCancel} className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">取消</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div><span className="text-gray-500">模板:</span> {tpl?.name || session.template_id.slice(0, 8) + '...'}</div>
        <div><span className="text-gray-500">版本:</span> v{session.template_version}</div>
        <div><span className="text-gray-500">创建者:</span> {session.created_by}</div>
        <div><span className="text-gray-500">开始时间:</span> {session.started_at?.slice(0, 19).replace('T', ' ') || '-'}</div>
      </div>

      {/* 阶段进度条 */}
      {stages.length > 0 && (
        <section className="mb-6">
          <h4 className="font-medium mb-3">阶段进度</h4>
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {stages.map((stage: any, idx: number) => {
              const state = stageStates[stage.id] || {}
              const status = state.status || 'pending'
              return (
                <div key={stage.id} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[80px]">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${STAGE_DOT_COLORS[status] || 'bg-gray-300'}`}>
                      {status === 'completed' ? '✓' : status === 'failed' ? '✗' : idx + 1}
                    </div>
                    <span className="text-xs mt-1 text-center leading-tight">{stage.name}</span>
                    <span className={`text-[10px] ${STATUS_COLORS[status]} px-1 rounded mt-0.5`}>
                      {STATUS_LABELS[status] || status}
                    </span>
                    {status === 'failed' && (
                      <button
                        onClick={() => handleRetry(stage.id)}
                        className="px-1.5 py-0.5 text-[10px] border rounded hover:bg-gray-50 mt-0.5"
                      >
                        重试
                      </button>
                    )}
                  </div>
                  {idx < stages.length - 1 && (
                    <div className="w-8 h-0.5 bg-gray-300 mx-1 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 上下文面板 */}
      <section className="mb-6">
        <h4 className="font-medium mb-2">上下文产出</h4>
        <ContextPanel stages={stages} stageStates={stageStates} />
      </section>

      {/* 审核面板 */}
      {waitingReviewStage && (
        <ReviewPanel
          stageId={waitingReviewStage[0]}
          stageState={waitingReviewStage[1] as any}
          stages={stages}
          onReview={handleReview}
        />
      )}
    </div>
  )
}

/* ---------- 上下文面板 ---------- */

function ContextPanel({ stages, stageStates }: { stages: any[]; stageStates: Record<string, any> }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const completedStages = stages.filter((s: any) => {
    const state = stageStates[s.id]
    return state && (state.status === 'completed' || state.status === 'waiting_review')
  })

  if (completedStages.length === 0) {
    return <p className="text-gray-400 text-sm">暂无已完成的阶段产出</p>
  }

  return (
    <div className="space-y-2">
      {completedStages.map((stage: any) => {
        const state = stageStates[stage.id] || {}
        const isOpen = expanded.has(stage.id)
        return (
          <div key={stage.id} className="border rounded">
            <div
              className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50"
              onClick={() => toggle(stage.id)}
            >
              <span className="text-sm font-medium">{stage.name}</span>
              <span className="text-gray-400 text-xs">{isOpen ? '收起' : '展开'}</span>
            </div>
            {isOpen && (
              <div className="px-3 pb-3 border-t">
                <pre className="text-xs bg-gray-50 rounded p-2 mt-2 overflow-auto max-h-60">
                  {state.output
                    ? (typeof state.output === 'string' ? state.output : JSON.stringify(state.output, null, 2))
                    : '无产出'}
                </pre>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- 审核面板 ---------- */

function ReviewPanel({ stageId, stageState, stages, onReview }: {
  stageId: string
  stageState: any
  stages: any[]
  onReview: (stageId: string, approved: boolean, comment: string) => Promise<void>
}) {
  const stage = stages.find((s: any) => s.id === stageId)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (approved: boolean) => {
    setSubmitting(true)
    try {
      await onReview(stageId, approved, comment)
      setComment('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="border border-orange-200 rounded-lg p-4 bg-orange-50/50">
      <h4 className="font-medium mb-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-orange-400" />
        待审核: {stage?.name || stageId}
      </h4>

      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">阶段产出</label>
        <pre className="text-xs bg-white rounded p-2 border overflow-auto max-h-40">
          {stageState.output
            ? (typeof stageState.output === 'string' ? stageState.output : JSON.stringify(stageState.output, null, 2))
            : '无产出'}
        </pre>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">评论</label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={2}
          className="w-full border rounded px-3 py-1.5 text-sm"
          placeholder="输入审核评论（可选）"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => handleSubmit(false)}
          disabled={submitting}
          className="px-3 py-1.5 text-sm bg-red-50 border border-red-200 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
        >
          拒绝
        </button>
        <button
          onClick={() => handleSubmit(true)}
          disabled={submitting}
          className="px-3 py-1.5 text-sm bg-green-50 border border-green-200 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
        >
          通过
        </button>
      </div>
    </section>
  )
}

/* ---------- 创建会话模态框 ---------- */

function CreateSessionForm({ templates, onClose, onCreated }: {
  templates: any[]
  onClose: () => void
  onCreated: () => void
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const [initialInput, setInitialInput] = useState('{}')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setError('')
    setSaving(true)
    try {
      const input = JSON.parse(initialInput)
      const res = await api.workspaceSessions.create({ template_id: templateId, initial_input: input, created_by: 'operator' })
      if ((res as any).error) {
        setError((res as any).error)
      } else {
        await api.workspaceSessions.start((res as any).session?.id || (res as any).id)
        onCreated()
      }
    } catch (e: any) {
      setError(e.message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[480px] p-6">
        <h3 className="text-lg font-bold mb-4">启动会话</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">选择模板 *</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm">
              {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">初始输入 (JSON)</label>
            <textarea value={initialInput} onChange={e => setInitialInput(e.target.value)} rows={4} className="w-full border rounded px-3 py-1.5 text-sm font-mono text-xs" />
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">取消</button>
          <button onClick={handleCreate} disabled={saving || !templateId} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? '启动中...' : '启动'}
          </button>
        </div>
      </div>
    </div>
  )
}

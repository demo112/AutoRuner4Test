import { useState, useEffect } from 'react'
import { api, type WorkspaceSession, type WorkspaceTemplate, type SegmentState } from '../lib/api'
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

const SEGMENT_COLORS: Record<string, string> = {
  pending: 'bg-gray-300',
  running: 'bg-blue-400 animate-pulse',
  waiting_review: 'bg-orange-400',
  completed: 'bg-green-400',
  failed: 'bg-red-400',
}

const GATE_COLORS: Record<string, string> = {
  pending: 'border-gray-300 bg-gray-50',
  approved: 'border-green-300 bg-green-50',
  rejected: 'border-red-300 bg-red-50',
  waiting: 'border-orange-300 bg-orange-50',
}

export default function WorkspaceSessions() {
  const { workspaceSessions, loadingWorkspaceSessions, fetchWorkspaceSessions, fetchWorkspaceTemplates, workspaceTemplates } = useStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkspaceSessions()
    fetchWorkspaceTemplates()
  }, [])

  if (loadingWorkspaceSessions) return <div className="p-6">加载中...</div>

  const session = selectedId
    ? workspaceSessions.find(s => s.id === selectedId) || null
    : null

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">工作会话</h2>
      </div>

      {session ? (
        <SessionDetail
          session={session}
          templates={workspaceTemplates}
          onBack={() => setSelectedId(null)}
          onRefresh={() => { fetchWorkspaceSessions(); fetchWorkspaceTemplates() }}
        />
      ) : (
        <div className="space-y-3">
          {workspaceSessions.map(s => {
            const tpl = workspaceTemplates.find(t => t.id === s.template_id)
            return (
              <div
                key={s.id}
                onClick={() => setSelectedId(s.id)}
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
            <p className="text-gray-400 text-center py-8">暂无工作会话</p>
          )}
        </div>
      )}
    </div>
  )
}

function SessionDetail({ session, templates, onBack, onRefresh }: {
  session: WorkspaceSession
  templates: WorkspaceTemplate[]
  onBack: () => void
  onRefresh: () => void
}) {
  const tpl = templates.find(t => t.id === session.template_id)
  const segmentStates = session.segment_states
  const gates = tpl?.review_gates || []
  const totalSegments = gates.length + 1

  const handleCancel = async () => {
    if (confirm('确定取消此会话？')) {
      await api.workspaceSessions.cancel(session.id)
      onRefresh()
    }
  }

  const handleReview = async (gateId: string, result: 'approved' | 'rejected', comment: string) => {
    await api.workspaceSessions.review(session.id, gateId, result, comment)
    onRefresh()
  }

  const handleRetry = async (gateId: string) => {
    await api.workspaceSessions.retry(session.id, gateId)
    onRefresh()
  }

  // Build segment list with interleaved gates
  const segments: Array<{ type: 'segment'; index: number; state: SegmentState | null } | { type: 'gate'; gate: typeof gates[0]; gateState: string }> = []
  for (let i = 0; i < totalSegments; i++) {
    const segKey = `segment_${i}`
    const state = segmentStates?.[segKey] || null
    segments.push({ type: 'segment', index: i, state })
    if (i < gates.length) {
      const gate = gates[i]
      // Determine gate state
      let gateState = 'pending'
      const nextSegKey = `segment_${i + 1}`
      const nextSegState = segmentStates?.[nextSegKey]
      const currentSegState = state
      if (currentSegState?.status === 'completed' && !nextSegState?.started_at) {
        // Current segment done, next hasn't started → gate is active
        gateState = session.current_gate === gate.id ? 'waiting' : 'approved'
      }
      // Check review history for this gate
      const reviewForGate = session.review_history?.find(r => r.gateId === gate.id)
      if (reviewForGate) {
        gateState = reviewForGate.result
      }
      segments.push({ type: 'gate', gate, gateState })
    }
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-3">← 返回列表</button>

      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">会话详情</h3>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[session.status]}`}>
            {STATUS_LABELS[session.status] || session.status}
          </span>
          {(session.status === 'running' || session.status === 'waiting_review') && (
            <button onClick={handleCancel} className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">
              取消
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div><span className="text-gray-500">模板:</span> {tpl?.name || session.template_id.slice(0, 8) + '...'}</div>
        <div><span className="text-gray-500">版本:</span> v{session.template_version}</div>
        <div><span className="text-gray-500">创建者:</span> {session.created_by}</div>
        <div><span className="text-gray-500">开始时间:</span> {session.started_at?.slice(0, 19).replace('T', ' ') || '-'}</div>
      </div>

      {/* 执行进度 */}
      <section className="mb-6">
        <h4 className="font-medium mb-3">执行进度</h4>
        <div className="space-y-0">
          {segments.map((item, idx) => {
            if (item.type === 'segment') {
              const status = item.state?.status || 'pending'
              return (
                <div key={`seg-${item.index}`} className="flex items-start gap-3 py-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${SEGMENT_COLORS[status] || 'bg-gray-300'}`}>
                    {status === 'completed' ? '✓' : status === 'failed' ? '✗' : item.index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">执行段 {item.index + 1}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[status]}`}>
                        {STATUS_LABELS[status] || status}
                      </span>
                    </div>
                    {item.state?.error && <p className="text-xs text-red-500 mt-1">{item.state.error}</p>}
                    {item.state?.output && (
                      <details className="mt-1">
                        <summary className="text-xs text-gray-400 cursor-pointer">产出</summary>
                        <pre className="text-xs bg-gray-50 rounded p-2 mt-1 overflow-auto max-h-40">
                          {typeof item.state.output === 'string' ? item.state.output : JSON.stringify(item.state.output, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )
            } else {
              // Gate
              const { gate, gateState } = item
              const isWaiting = gateState === 'waiting' || session.current_gate === gate.id
              return (
                <div key={`gate-${gate.id}`} className={`border-l-2 ml-4 pl-4 py-2 ${GATE_COLORS[gateState] || GATE_COLORS.pending} rounded-r`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-amber-700">审核点: {gate.name}</span>
                      {gate.description && <p className="text-[10px] text-gray-500">{gate.description}</p>}
                    </div>
                    {isWaiting && session.status === 'waiting_review' && (
                      <span className="text-xs text-orange-600 font-medium">等待审核</span>
                    )}
                    {gateState === 'approved' && <span className="text-xs text-green-600">已通过 ✓</span>}
                    {gateState === 'rejected' && <span className="text-xs text-red-600">已拒绝 ✗</span>}
                  </div>

                  {isWaiting && session.status === 'waiting_review' && (
                    <GateReviewPanel
                      gateId={gate.id}
                      onReview={handleReview}
                      onRetry={handleRetry}
                    />
                  )}
                </div>
              )
            }
          })}
        </div>
      </section>

      {/* 审核历史 */}
      {session.review_history && session.review_history.length > 0 && (
        <section className="mb-6">
          <h4 className="font-medium mb-2">审核记录</h4>
          <div className="space-y-2">
            {session.review_history.map((r, idx) => (
              <div key={idx} className="flex items-center gap-3 text-sm border-b pb-2">
                <span className={`px-1.5 py-0.5 rounded text-xs ${r.result === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {r.result === 'approved' ? '通过' : '拒绝'}
                </span>
                <span className="text-gray-600">{r.gateId}</span>
                {r.comment && <span className="text-gray-400 text-xs">"{r.comment}"</span>}
                <span className="text-gray-400 text-xs ml-auto">{r.reviewed_at?.slice(0, 19).replace('T', ' ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 输入输出 */}
      <section className="mb-6">
        <h4 className="font-medium mb-2">输入 / 输出</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">输入</label>
            <pre className="text-xs bg-gray-50 rounded p-2 border overflow-auto max-h-40">
              {session.input ? JSON.stringify(session.input, null, 2) : '无'}
            </pre>
          </div>
          <div>
            <label className="text-xs text-gray-500">输出</label>
            <pre className="text-xs bg-gray-50 rounded p-2 border overflow-auto max-h-40">
              {session.output ? (typeof session.output === 'string' ? session.output : JSON.stringify(session.output, null, 2)) : '暂无'}
            </pre>
          </div>
        </div>
      </section>

      {/* 错误信息 */}
      {session.error && (
        <section className="mb-6 border border-red-200 rounded-lg p-4 bg-red-50">
          <h4 className="font-medium text-red-700 mb-1">错误</h4>
          <p className="text-sm text-red-600">{session.error}</p>
        </section>
      )}
    </div>
  )
}


function GateReviewPanel({ gateId, onReview, onRetry }: {
  gateId: string
  onReview: (gateId: string, result: 'approved' | 'rejected', comment: string) => Promise<void>
  onRetry: (gateId: string) => Promise<void>
}) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (result: 'approved' | 'rejected') => {
    setSubmitting(true)
    try {
      await onReview(gateId, result, comment)
      setComment('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-orange-200">
      <div className="mb-2">
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
          onClick={() => onRetry(gateId)}
          className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
        >
          重试
        </button>
        <button
          onClick={() => handleSubmit('rejected')}
          disabled={submitting}
          className="px-3 py-1.5 text-sm bg-red-50 border border-red-200 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
        >
          拒绝
        </button>
        <button
          onClick={() => handleSubmit('approved')}
          disabled={submitting}
          className="px-3 py-1.5 text-sm bg-green-50 border border-green-200 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
        >
          通过
        </button>
      </div>
    </div>
  )
}

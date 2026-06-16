import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'

const STATUS_LABELS: Record<string, string> = {
  pending: '待执行',
  running: '执行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '已失败',
  cancelled: '已取消',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const NODE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-200',
  ready: 'bg-blue-200',
  running: 'bg-blue-400',
  completed: 'bg-green-400',
  done: 'bg-green-500',
  failed: 'bg-red-400',
  waiting_confirmation: 'bg-yellow-400',
}

export default function PipelineRuns() {
  const { pipelineRuns, loadingPipelineRuns, fetchPipelineRuns, fetchPipelineTemplates, pipelineTemplates } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedRun, setSelectedRun] = useState<string | null>(null)

  useEffect(() => {
    fetchPipelineRuns()
    fetchPipelineTemplates()
  }, [])

  if (loadingPipelineRuns) return <div className="p-6">加载中...</div>

  const run = selectedRun ? pipelineRuns.find((r: any) => r.id === selectedRun) : null

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">流程运行</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          启动流程
        </button>
      </div>

      {run ? (
        <RunDetail run={run} onBack={() => setSelectedRun(null)} onRefresh={fetchPipelineRuns} />
      ) : (
        <div className="space-y-3">
          {pipelineRuns.map((r: any) => (
            <div
              key={r.id}
              onClick={() => setSelectedRun(r.id)}
              className="border rounded-lg p-4 hover:shadow-sm cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{r.template_id.slice(0, 8)}...</h3>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span>v{r.template_version}</span>
                    <span>{r.created_by}</span>
                    <span>{r.created_at?.slice(0, 19).replace('T', ' ')}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[r.status] || 'bg-gray-100'}`}>
                  {STATUS_LABELS[r.status] || r.status}
                </span>
              </div>
            </div>
          ))}
          {pipelineRuns.length === 0 && (
            <p className="text-gray-400 text-center py-8">暂无流程运行，点击上方按钮启动</p>
          )}
        </div>
      )}

      {showCreate && (
        <CreateRunForm
          templates={pipelineTemplates}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchPipelineRuns() }}
        />
      )}
    </div>
  )
}

function RunDetail({ run, onBack, onRefresh }: { run: any; onBack: () => void; onRefresh: () => void }) {
  const handleConfirm = async (nodeId: string, approved: boolean) => {
    await api.pipelineRuns.confirm(run.id, nodeId, approved)
    onRefresh()
  }

  const handleCancel = async () => {
    if (confirm('确定取消？')) {
      await api.pipelineRuns.cancel(run.id)
      onRefresh()
    }
  }

  const handleRetry = async (nodeId: string) => {
    await api.pipelineRuns.retry(run.id, nodeId)
    onRefresh()
  }

  const nodeStates = run.node_states || {}

  return (
    <div>
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-3">← 返回列表</button>

      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">运行详情</h3>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[run.status]}`}>
            {STATUS_LABELS[run.status] || run.status}
          </span>
          {(run.status === 'running' || run.status === 'paused') && (
            <button onClick={handleCancel} className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">取消</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div><span className="text-gray-500">模板:</span> {run.template_id.slice(0, 8)}...</div>
        <div><span className="text-gray-500">版本:</span> v{run.template_version}</div>
        <div><span className="text-gray-500">创建者:</span> {run.created_by}</div>
        <div><span className="text-gray-500">开始时间:</span> {run.started_at?.slice(0, 19).replace('T', ' ') || '-'}</div>
      </div>

      <h4 className="font-medium mb-2">节点状态</h4>
      <div className="space-y-2">
        {Object.entries(nodeStates).map(([nodeId, state]: [string, any]) => (
          <div key={nodeId} className="border rounded p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${NODE_STATUS_COLORS[state.status] || 'bg-gray-300'}`} />
              <span className="text-sm font-medium">{nodeId}</span>
              <span className="text-xs text-gray-400">{STATUS_LABELS[state.status] || state.status}</span>
            </div>
            <div className="flex gap-1">
              {state.status === 'waiting_confirmation' && (
                <>
                  <button onClick={() => handleConfirm(nodeId, true)} className="px-2 py-0.5 text-xs bg-green-50 border border-green-200 text-green-700 rounded hover:bg-green-100">通过</button>
                  <button onClick={() => handleConfirm(nodeId, false)} className="px-2 py-0.5 text-xs bg-red-50 border border-red-200 text-red-700 rounded hover:bg-red-100">拒绝</button>
                </>
              )}
              {state.status === 'failed' && (
                <button onClick={() => handleRetry(nodeId)} className="px-2 py-0.5 text-xs border rounded hover:bg-gray-50">重试</button>
              )}
              {state.error && <span className="text-xs text-red-500 ml-2">{state.error}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CreateRunForm({ templates, onClose, onCreated }: { templates: any[]; onClose: () => void; onCreated: () => void }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const [initialInput, setInitialInput] = useState('{}')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setError('')
    setSaving(true)
    try {
      const input = JSON.parse(initialInput)
      const run = await api.pipelineRuns.create({ template_id: templateId, initial_input: input, created_by: 'operator' })
      if ((run as any).error) {
        setError((run as any).error)
      } else {
        await api.pipelineRuns.start((run as any).id)
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
        <h3 className="text-lg font-bold mb-4">启动流程</h3>
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

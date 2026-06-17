import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type WorkspaceTemplate } from '../lib/api'
import { useStore } from '../lib/store'

export default function WorkspaceTaskLaunch() {
  const { workspaceTemplates, loadingWorkspaceTemplates, fetchWorkspaceTemplates } = useStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inputJson, setInputJson] = useState('{}')
  const [inputError, setInputError] = useState('')
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => { fetchWorkspaceTemplates({ starter: true }) }, [])

  const selectedTemplate = workspaceTemplates.find(t => t.id === selectedId)

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setInputError('')
    const tpl = workspaceTemplates.find(t => t.id === id)
    if (tpl?.input_schema && Object.keys(tpl.input_schema).length > 0) {
      const props = (tpl.input_schema as any).properties || {}
      const defaults: Record<string, unknown> = {}
      for (const [key, schema] of Object.entries(props)) {
        const s = schema as any
        if (s.default !== undefined) defaults[key] = s.default
        else if (s.type === 'string') defaults[key] = ''
        else if (s.type === 'number') defaults[key] = 0
        else if (s.type === 'boolean') defaults[key] = false
      }
      setInputJson(JSON.stringify(defaults, null, 2))
    } else {
      setInputJson('{}')
    }
  }

  const handleLaunch = async () => {
    setError('')
    setInputError('')

    if (!selectedId) { setError('请选择模板'); return }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(inputJson)
    } catch {
      setInputError('JSON 格式错误')
      return
    }

    setLaunching(true)
    try {
      const { session } = await api.workspaceSessions.create({
        template_id: selectedId,
        input: parsed,
        created_by: 'operator',
      })
      await api.workspaceSessions.start(session.id)
      navigate(`/workspace/sessions/${session.id}`)
    } catch (e: any) {
      setError(e.message || '启动失败')
    } finally {
      setLaunching(false)
    }
  }

  if (loadingWorkspaceTemplates) return <div className="p-6">加载中...</div>

  const starters = workspaceTemplates.filter(t => t.is_starter)
  const others = workspaceTemplates.filter(t => !t.is_starter)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-6">启动任务</h2>

      {/* 步骤 1: 选择模板 */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">选择模板</h3>

        {starters.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 mb-2">推荐模板</p>
            <div className="grid grid-cols-2 gap-3">
              {starters.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  selected={selectedId === t.id}
                  onClick={() => handleSelect(t.id)}
                />
              ))}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2">其他模板</p>
            <div className="grid grid-cols-2 gap-3">
              {others.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  selected={selectedId === t.id}
                  onClick={() => handleSelect(t.id)}
                />
              ))}
            </div>
          </div>
        )}

        {workspaceTemplates.length === 0 && (
          <p className="text-gray-400 text-center py-8">暂无可用模板</p>
        )}
      </section>

      {/* 步骤 2: 输入 */}
      {selectedTemplate && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">任务输入</h3>
          <div className="bg-gray-50 rounded-lg p-4 mb-3">
            <p className="text-sm text-gray-700">{selectedTemplate.description || '无描述'}</p>
            {selectedTemplate.review_gates.length > 0 && (
              <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                <span>⚠</span>
                <span>包含 {selectedTemplate.review_gates.length} 个审核点，执行过程中需人工确认</span>
              </div>
            )}
            {selectedTemplate.review_gates.length === 0 && (
              <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                <span>✓</span>
                <span>无审核点，全程自动执行</span>
              </div>
            )}
          </div>
          <textarea
            value={inputJson}
            onChange={e => { setInputJson(e.target.value); setInputError('') }}
            rows={6}
            className="w-full border rounded px-3 py-2 text-sm font-mono"
          />
          {inputError && <p className="text-red-500 text-xs mt-1">{inputError}</p>}
        </section>
      )}

      {/* 步骤 3: 启动 */}
      {selectedTemplate && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            模板: {selectedTemplate.name} · 审核点: {selectedTemplate.review_gates.length}
          </p>
          <button
            onClick={handleLaunch}
            disabled={launching}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {launching ? '启动中...' : '启动任务'}
          </button>
        </div>
      )}

      {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
    </div>
  )
}

function TemplateCard({ template, selected, onClick }: {
  template: WorkspaceTemplate
  selected: boolean
  onClick: () => void
}) {
  const gateCount = template.review_gates?.length || 0
  return (
    <div
      onClick={onClick}
      className={`border rounded-lg p-3 cursor-pointer transition-colors ${
        selected ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{template.name}</h4>
        {template.is_starter && <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-600 rounded">内置</span>}
      </div>
      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{template.description || '无描述'}</p>
      <div className="flex gap-2 mt-2 text-[10px] text-gray-400">
        {template.category && <span>{template.category}</span>}
        <span>{gateCount === 0 ? '自动执行' : `${gateCount} 审核点`}</span>
      </div>
    </div>
  )
}

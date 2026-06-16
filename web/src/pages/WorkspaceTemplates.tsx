import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'

interface Stage {
  id: string
  name: string
  description: string
  output_spec: string
  review_required: boolean
  toolbox: string[]
}

export default function WorkspaceTemplates() {
  const { workspaceTemplates, loadingWorkspaceTemplates, fetchWorkspaceTemplates } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => { fetchWorkspaceTemplates() }, [])

  if (loadingWorkspaceTemplates) return <div className="p-6">加载中...</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">工作环境模板</h2>
        <button
          onClick={() => { setEditingId(null); setShowForm(true) }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          新建模板
        </button>
      </div>

      <div className="space-y-3">
        {workspaceTemplates.map((t: any) => {
          const stageCount = t.stages?.length || 0
          const toolboxCount = t.global_toolbox?.length || 0
          return (
            <div key={t.id} className="border rounded-lg p-4 hover:shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{t.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{t.description || '无描述'}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-400">
                    <span>角色: {t.role || '-'}</span>
                    <span>阶段: {stageCount}</span>
                    <span>工具箱: {toolboxCount}</span>
                    <span>v{t.version || 1}</span>
                    <span>{t.is_public ? '公开' : '私有'}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingId(t.id); setShowForm(true) }}
                    className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                  >
                    编辑
                  </button>
                  <button
                    onClick={async () => { if (confirm('确定删除？')) { await api.workspaceTemplates.delete(t.id); fetchWorkspaceTemplates() } }}
                    className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {workspaceTemplates.length === 0 && (
          <p className="text-gray-400 text-center py-8">暂无工作环境模板，点击上方按钮创建</p>
        )}
      </div>

      {showForm && (
        <TemplateForm
          templateId={editingId}
          onClose={() => { setShowForm(false); setEditingId(null) }}
          onSaved={() => { setShowForm(false); setEditingId(null); fetchWorkspaceTemplates() }}
        />
      )}
    </div>
  )
}

function TemplateForm({ templateId, onClose, onSaved }: { templateId: string | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [role, setRole] = useState('')
  const [constraints, setConstraints] = useState('')
  const [globalToolbox, setGlobalToolbox] = useState('')
  const [stages, setStages] = useState<Stage[]>([])
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set())
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (templateId) {
      api.workspaceTemplates.get(templateId).then((res: any) => {
        const t = res.template || res
        setName(t.name || '')
        setDescription(t.description || '')
        setRole(t.role || '')
        setConstraints((t.constraints || []).join('\n'))
        setGlobalToolbox((t.global_toolbox || []).join(', '))
        setStages((t.stages || []).map((s: any) => ({
          id: s.id || '',
          name: s.name || '',
          description: s.description || '',
          output_spec: s.output_spec || '',
          review_required: s.review_required || false,
          toolbox: s.toolbox || [],
        })))
        setIsPublic(t.is_public || false)
      })
    }
  }, [templateId])

  const toggleStage = (idx: number) => {
    setExpandedStages(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const updateStage = (idx: number, field: keyof Stage, value: any) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  const addStage = () => {
    const newIdx = stages.length
    setStages(prev => [...prev, { id: `stage_${newIdx + 1}`, name: '', description: '', output_spec: '', review_required: false, toolbox: [] }])
    setExpandedStages(prev => new Set([...prev, newIdx]))
  }

  const removeStage = (idx: number) => {
    setStages(prev => prev.filter((_, i) => i !== idx))
    setExpandedStages(prev => {
      const next = new Set<number>()
      prev.forEach(i => {
        if (i < idx) next.add(i)
        else if (i > idx) next.add(i - 1)
      })
      return next
    })
  }

  const handleSave = async () => {
    setError('')
    if (!name.trim()) { setError('名称不能为空'); return }
    setSaving(true)
    try {
      const constraintList = constraints.split('\n').map(s => s.trim()).filter(Boolean)
      const globalToolboxList = globalToolbox.split(',').map(s => s.trim()).filter(Boolean)
      const payload = {
        name: name.trim(),
        description,
        role,
        constraints: constraintList,
        global_toolbox: globalToolboxList,
        stages: stages.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          output_spec: s.output_spec,
          review_required: s.review_required,
          toolbox: s.toolbox,
        })),
        is_public: isPublic,
        created_by: 'operator',
      }

      if (templateId) {
        await api.workspaceTemplates.update(templateId, payload)
      } else {
        await api.workspaceTemplates.create(payload)
      }
      onSaved()
    } catch (e: any) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[720px] max-h-[90vh] overflow-auto p-6">
        <h3 className="text-lg font-bold mb-4">{templateId ? '编辑模板' : '新建模板'}</h3>

        <div className="space-y-4">
          {/* 区1: 基础信息 */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-600 border-b pb-1">基础信息</h4>
            <div>
              <label className="block text-sm font-medium mb-1">名称 *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">描述</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full border rounded px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">角色</label>
              <textarea value={role} onChange={e => setRole(e.target.value)} rows={2} className="w-full border rounded px-3 py-1.5 text-sm" placeholder="定义工作环境中的角色职责" />
            </div>
          </section>

          {/* 区2: 约束规则 + 全局工具箱 */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-600 border-b pb-1">约束与工具</h4>
            <div>
              <label className="block text-sm font-medium mb-1">约束规则</label>
              <textarea value={constraints} onChange={e => setConstraints(e.target.value)} rows={3} className="w-full border rounded px-3 py-1.5 text-sm" placeholder="每行一条约束规则" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">全局工具箱</label>
              <textarea value={globalToolbox} onChange={e => setGlobalToolbox(e.target.value)} rows={2} className="w-full border rounded px-3 py-1.5 text-sm" placeholder="逗号分隔组件 ID，如: comp_a, comp_b" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} id="isPublic" />
              <label htmlFor="isPublic" className="text-sm">公开</label>
            </div>
          </section>

          {/* 区3: 阶段列表 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-600 border-b pb-1 flex-1">阶段列表</h4>
              <button onClick={addStage} className="ml-2 px-2 py-1 text-xs border rounded hover:bg-gray-50 shrink-0">
                + 添加阶段
              </button>
            </div>

            {stages.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-2">暂无阶段，点击"添加阶段"</p>
            )}

            <div className="space-y-2">
              {stages.map((s, idx) => (
                <div key={idx} className="border rounded">
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleStage(idx)}
                  >
                    <span className="text-sm font-medium">
                      {idx + 1}. {s.name || `阶段 ${idx + 1}`}
                    </span>
                    <div className="flex items-center gap-2">
                      {s.review_required && <span className="text-xs text-amber-600">需审查</span>}
                      <span className="text-gray-400 text-xs">{expandedStages.has(idx) ? '收起' : '展开'}</span>
                    </div>
                  </div>

                  {expandedStages.has(idx) && (
                    <div className="px-3 pb-3 space-y-2 border-t">
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <div>
                          <label className="block text-xs font-medium mb-1">ID</label>
                          <input value={s.id} onChange={e => updateStage(idx, 'id', e.target.value)} className="w-full border rounded px-2 py-1 text-xs" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">名称</label>
                          <input value={s.name} onChange={e => updateStage(idx, 'name', e.target.value)} className="w-full border rounded px-2 py-1 text-xs" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">描述</label>
                        <textarea value={s.description} onChange={e => updateStage(idx, 'description', e.target.value)} rows={2} className="w-full border rounded px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">输出规格 (output_spec)</label>
                        <textarea value={s.output_spec} onChange={e => updateStage(idx, 'output_spec', e.target.value)} rows={2} className="w-full border rounded px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">阶段工具箱</label>
                        <textarea
                          value={s.toolbox.join(', ')}
                          onChange={e => updateStage(idx, 'toolbox', e.target.value.split(',').map(v => v.trim()).filter(Boolean))}
                          rows={1}
                          className="w-full border rounded px-2 py-1 text-xs"
                          placeholder="逗号分隔组件 ID"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={s.review_required}
                            onChange={e => updateStage(idx, 'review_required', e.target.checked)}
                            id={`review_${idx}`}
                          />
                          <label htmlFor={`review_${idx}`} className="text-xs">需要审查</label>
                        </div>
                        <button
                          onClick={() => removeStage(idx)}
                          className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                        >
                          删除阶段
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">取消</button>
          <button onClick={handleSave} disabled={saving || !name} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

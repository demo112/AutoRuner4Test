import { useState, useEffect } from 'react'
import { api, type WorkspaceTemplate, type ClaudeDirPreview } from '../lib/api'
import { useStore } from '../lib/store'

interface GateForm {
  id: string
  name: string
  description: string
}

export default function WorkspaceTemplates() {
  const { workspaceTemplates, loadingWorkspaceTemplates, fetchWorkspaceTemplates } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)

  useEffect(() => { fetchWorkspaceTemplates() }, [])

  if (loadingWorkspaceTemplates) return <div className="p-6">加载中...</div>

  const handleClone = async (id: string) => {
    try {
      await api.workspaceTemplates.clone(id, 'operator')
      fetchWorkspaceTemplates()
    } catch (e: any) {
      alert(e.message || '克隆失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此模板？')) return
    try {
      await api.workspaceTemplates.delete(id)
      fetchWorkspaceTemplates()
    } catch (e: any) {
      alert(e.message || '删除失败')
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">工作环境模板</h2>
        <button
          onClick={() => { setEditingId(null); setShowEditor(true) }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          新建模板
        </button>
      </div>

      <div className="space-y-3">
        {workspaceTemplates.map((t) => {
          const gateCount = t.review_gates?.length || 0
          const compCount = (t.skills?.length || 0) + (t.hooks?.length || 0) + (t.mcp_servers?.length || 0) + (t.rules?.length || 0)
          return (
            <div key={t.id} className="border rounded-lg p-4 hover:shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{t.name}</h3>
                    {t.category && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{t.category}</span>}
                    {t.is_starter && <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded">内置</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{t.description || '无描述'}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-400">
                    <span>审核点: {gateCount}</span>
                    <span>组件: {compCount}</span>
                    <span>v{t.version}</span>
                    <span>{t.is_public ? '公开' : '私有'}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setPreviewId(t.id)} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">预览</button>
                  <button onClick={() => handleClone(t.id)} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">克隆</button>
                  <button onClick={() => { setEditingId(t.id); setShowEditor(true) }} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">编辑</button>
                  <button onClick={() => handleDelete(t.id)} className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">删除</button>
                </div>
              </div>
            </div>
          )
        })}
        {workspaceTemplates.length === 0 && (
          <p className="text-gray-400 text-center py-8">暂无工作环境模板，点击上方按钮创建</p>
        )}
      </div>

      {showEditor && (
        <TemplateEditor
          templateId={editingId}
          onClose={() => { setShowEditor(false); setEditingId(null) }}
          onSaved={() => { setShowEditor(false); setEditingId(null); fetchWorkspaceTemplates() }}
        />
      )}

      {previewId && (
        <PreviewModal templateId={previewId} onClose={() => setPreviewId(null)} />
      )}
    </div>
  )
}

function TemplateEditor({ templateId, onClose, onSaved }: { templateId: string | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [isStarter, setIsStarter] = useState(false)
  const [claudeMd, setClaudeMd] = useState('')
  const [reviewGates, setReviewGates] = useState<GateForm[]>([])
  const [skillsJson, setSkillsJson] = useState('[]')
  const [hooksJson, setHooksJson] = useState('[]')
  const [mcpServersJson, setMcpServersJson] = useState('[]')
  const [rulesJson, setRulesJson] = useState('[]')
  const [inputSchemaJson, setInputSchemaJson] = useState('{}')
  const [outputDescription, setOutputDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (templateId) {
      api.workspaceTemplates.get(templateId).then((res) => {
        const t = res.template
        setName(t.name || '')
        setDescription(t.description || '')
        setCategory(t.category || '')
        setIsPublic(t.is_public || false)
        setIsStarter(t.is_starter || false)
        setClaudeMd(t.claude_md || '')
        setReviewGates((t.review_gates || []).map((g: any) => ({
          id: g.id || '',
          name: g.name || '',
          description: g.description || '',
        })))
        setSkillsJson(JSON.stringify(t.skills || [], null, 2))
        setHooksJson(JSON.stringify(t.hooks || [], null, 2))
        setMcpServersJson(JSON.stringify(t.mcp_servers || [], null, 2))
        setRulesJson(JSON.stringify(t.rules || [], null, 2))
        setInputSchemaJson(JSON.stringify(t.input_schema || {}, null, 2))
        setOutputDescription(t.output_description || '')
      })
    }
  }, [templateId])

  const addGate = () => {
    const idx = reviewGates.length + 1
    setReviewGates(prev => [...prev, { id: `gate_${idx}`, name: '', description: '' }])
  }

  const removeGate = (idx: number) => {
    setReviewGates(prev => prev.filter((_, i) => i !== idx))
  }

  const updateGate = (idx: number, field: keyof GateForm, value: string) => {
    setReviewGates(prev => prev.map((g, i) => i === idx ? { ...g, [field]: value } : g))
  }

  const validateJson = (json: string): boolean => {
    try { JSON.parse(json); return true } catch { return false }
  }

  const handleSave = async () => {
    setError('')
    if (!name.trim()) { setError('名称不能为空'); return }
    if (!validateJson(skillsJson)) { setError('Skills JSON 格式错误'); return }
    if (!validateJson(hooksJson)) { setError('Hooks JSON 格式错误'); return }
    if (!validateJson(mcpServersJson)) { setError('MCP Servers JSON 格式错误'); return }
    if (!validateJson(rulesJson)) { setError('Rules JSON 格式错误'); return }
    if (!validateJson(inputSchemaJson)) { setError('Input Schema JSON 格式错误'); return }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description,
        category,
        claude_md: claudeMd,
        skills: skillsJson,
        hooks: hooksJson,
        mcp_servers: mcpServersJson,
        rules: rulesJson,
        review_gates: JSON.stringify(reviewGates),
        input_schema: inputSchemaJson,
        output_description: outputDescription,
        is_public: isPublic ? 1 : 0,
        is_starter: isStarter ? 1 : 0,
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
      <div className="bg-white rounded-lg shadow-lg w-[800px] max-h-[90vh] overflow-auto p-6">
        <h3 className="text-lg font-bold mb-4">{templateId ? '编辑模板' : '新建模板'}</h3>

        <div className="space-y-4">
          {/* 基础信息 */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-600 border-b pb-1">基础信息</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">名称 *</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">分类</label>
                <input value={category} onChange={e => setCategory(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm" placeholder="如: 开发、测试、部署" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">描述</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full border rounded px-3 py-1.5 text-sm" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
                公开
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isStarter} onChange={e => setIsStarter(e.target.checked)} />
                内置模板
              </label>
            </div>
          </section>

          {/* CLAUDE.md 核心 */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-600 border-b pb-1">CLAUDE.md（执行指令）</h4>
            <textarea
              value={claudeMd}
              onChange={e => setClaudeMd(e.target.value)}
              rows={8}
              className="w-full border rounded px-3 py-1.5 text-sm font-mono"
              placeholder="在此编写工作环境的执行指令，定义 AI 的角色、工作流程、输出格式等"
            />
          </section>

          {/* 审核点 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-600 border-b pb-1 flex-1">审核点（N 个审核点 → N+1 个执行段）</h4>
              <button onClick={addGate} className="ml-2 px-2 py-1 text-xs border rounded hover:bg-gray-50 shrink-0">
                + 添加审核点
              </button>
            </div>
            {reviewGates.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-2">无审核点 = 全程自动执行</p>
            )}
            <div className="space-y-2">
              {reviewGates.map((g, idx) => (
                <div key={idx} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-amber-600">审核点 {idx + 1}</span>
                    <button onClick={() => removeGate(idx)} className="text-xs text-red-500 hover:text-red-700">删除</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input value={g.id} onChange={e => updateGate(idx, 'id', e.target.value)} placeholder="ID" className="border rounded px-2 py-1 text-xs" />
                    <input value={g.name} onChange={e => updateGate(idx, 'name', e.target.value)} placeholder="名称" className="border rounded px-2 py-1 text-xs" />
                    <input value={g.description} onChange={e => updateGate(idx, 'description', e.target.value)} placeholder="描述" className="border rounded px-2 py-1 text-xs" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 组件配置 */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-600 border-b pb-1">组件配置（JSON）</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Skills</label>
                <textarea value={skillsJson} onChange={e => setSkillsJson(e.target.value)} rows={3} className="w-full border rounded px-2 py-1 text-xs font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Hooks</label>
                <textarea value={hooksJson} onChange={e => setHooksJson(e.target.value)} rows={3} className="w-full border rounded px-2 py-1 text-xs font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">MCP Servers</label>
                <textarea value={mcpServersJson} onChange={e => setMcpServersJson(e.target.value)} rows={3} className="w-full border rounded px-2 py-1 text-xs font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Rules</label>
                <textarea value={rulesJson} onChange={e => setRulesJson(e.target.value)} rows={3} className="w-full border rounded px-2 py-1 text-xs font-mono" />
              </div>
            </div>
          </section>

          {/* 输入输出 */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-600 border-b pb-1">输入输出</h4>
            <div>
              <label className="block text-xs font-medium mb-1">Input Schema（JSON）</label>
              <textarea value={inputSchemaJson} onChange={e => setInputSchemaJson(e.target.value)} rows={4} className="w-full border rounded px-2 py-1 text-xs font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">输出描述</label>
              <textarea value={outputDescription} onChange={e => setOutputDescription(e.target.value)} rows={2} className="w-full border rounded px-2 py-1 text-sm" placeholder="描述工作环境的最终产出" />
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

function PreviewModal({ templateId, onClose }: { templateId: string; onClose: () => void }) {
  const [preview, setPreview] = useState<ClaudeDirPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.workspaceTemplates.preview(templateId)
      .then(res => setPreview(res.preview))
      .catch(e => setError(e.message || '预览失败'))
      .finally(() => setLoading(false))
  }, [templateId])

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[640px] max-h-[80vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">.claude/ 目录预览</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {loading && <p className="text-gray-400">加载中...</p>}
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {preview && (
          <div className="space-y-3">
            {preview.files.map((f, i) => (
              <div key={i} className="border rounded">
                <div className="px-3 py-1.5 bg-gray-50 text-sm font-mono text-blue-600 border-b">{f.path}</div>
                <pre className="px-3 py-2 text-xs overflow-auto max-h-48">{f.content}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

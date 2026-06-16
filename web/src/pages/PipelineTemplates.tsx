import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'

export default function PipelineTemplates() {
  const { pipelineTemplates, loadingPipelineTemplates, fetchPipelineTemplates } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => { fetchPipelineTemplates() }, [])

  if (loadingPipelineTemplates) return <div className="p-6">加载中...</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">流程模板</h2>
        <button
          onClick={() => { setEditingId(null); setShowForm(true) }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          新建模板
        </button>
      </div>

      <div className="space-y-3">
        {pipelineTemplates.map((t: any) => (
          <div key={t.id} className="border rounded-lg p-4 hover:shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{t.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{t.description || '无描述'}</p>
                <div className="flex gap-3 mt-2 text-xs text-gray-400">
                  <span>节点: {t.nodes?.length || 0}</span>
                  <span>边: {t.edges?.length || 0}</span>
                  <span>v{t.version}</span>
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
                  onClick={async () => { if (confirm('确定删除？')) { await api.pipelineTemplates.delete(t.id); fetchPipelineTemplates() } }}
                  className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
        {pipelineTemplates.length === 0 && (
          <p className="text-gray-400 text-center py-8">暂无流程模板，点击上方按钮创建</p>
        )}
      </div>

      {showForm && (
        <TemplateForm
          templateId={editingId}
          onClose={() => { setShowForm(false); setEditingId(null) }}
          onSaved={() => { setShowForm(false); setEditingId(null); fetchPipelineTemplates() }}
        />
      )}
    </div>
  )
}

function TemplateForm({ templateId, onClose, onSaved }: { templateId: string | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [nodesJson, setNodesJson] = useState('[]')
  const [edgesJson, setEdgesJson] = useState('[]')
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (templateId) {
      api.pipelineTemplates.get(templateId).then((t: any) => {
        setName(t.name)
        setDescription(t.description || '')
        setNodesJson(JSON.stringify(t.nodes || [], null, 2))
        setEdgesJson(JSON.stringify(t.edges || [], null, 2))
        setIsPublic(t.is_public || false)
      })
    }
  }, [templateId])

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      const nodes = JSON.parse(nodesJson)
      const edges = JSON.parse(edgesJson)
      const payload = { name, description, nodes, edges, is_public: isPublic, created_by: 'operator' }

      if (templateId) {
        await api.pipelineTemplates.update(templateId, payload)
      } else {
        await api.pipelineTemplates.create(payload)
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
      <div className="bg-white rounded-lg shadow-lg w-[640px] max-h-[90vh] overflow-auto p-6">
        <h3 className="text-lg font-bold mb-4">{templateId ? '编辑模板' : '新建模板'}</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">名称 *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">描述</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full border rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">节点 (JSON)</label>
            <textarea value={nodesJson} onChange={e => setNodesJson(e.target.value)} rows={8} className="w-full border rounded px-3 py-1.5 text-sm font-mono text-xs" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">边 (JSON)</label>
            <textarea value={edgesJson} onChange={e => setEdgesJson(e.target.value)} rows={6} className="w-full border rounded px-3 py-1.5 text-sm font-mono text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
            <label className="text-sm">公开</label>
          </div>
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

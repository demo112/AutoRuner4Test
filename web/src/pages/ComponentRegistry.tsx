import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import ComponentCard from '../components/ComponentCard'
import DynamicForm from '../components/DynamicForm'

const TABS = ['all', 'skill', 'hook', 'mcp', 'rule'] as const

export default function ComponentRegistry() {
  const { components, fetchComponents } = useStore()
  const [activeTab, setActiveTab] = useState<string>('all')
  const [configId, setConfigId] = useState<string | null>(null)
  const [schema, setSchema] = useState<any>(null)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    fetchComponents(activeTab === 'all' ? undefined : activeTab)
  }, [activeTab, fetchComponents])

  const handleToggle = async (id: string, enabled: boolean) => {
    await api.components.toggle(id, enabled)
    fetchComponents(activeTab === 'all' ? undefined : activeTab)
  }

  const handleConfig = async (id: string) => {
    const { schema: s } = await api.components.getSchema(id)
    setSchema(s)
    setConfigId(id)
  }

  const handleInstall = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    await api.components.install({
      name: form.get('name'),
      type: form.get('type'),
      source: form.get('source'),
      description: form.get('description'),
    })
    setShowInstall(false)
    fetchComponents()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">组件市场</h2>
        <button
          onClick={() => setShowInstall(!showInstall)}
          className="px-4 py-1.5 bg-black text-white rounded text-sm"
        >
          安装组件
        </button>
      </div>

      {/* 安装表单 */}
      {showInstall && (
        <form onSubmit={handleInstall} className="border rounded-lg p-4 mb-4 space-y-3 bg-gray-50">
          <div className="grid grid-cols-2 gap-3">
            <input name="name" placeholder="组件名称" className="border rounded px-2 py-1 text-sm" required />
            <select name="type" className="border rounded px-2 py-1 text-sm" required>
              <option value="skill">Skill</option>
              <option value="hook">Hook</option>
              <option value="mcp">MCP</option>
              <option value="rule">Rule</option>
            </select>
            <input name="source" placeholder="来源路径" className="border rounded px-2 py-1 text-sm" required />
            <input name="description" placeholder="描述" className="border rounded px-2 py-1 text-sm" />
          </div>
          <button type="submit" className="px-4 py-1.5 bg-blue-500 text-white rounded text-sm">确认安装</button>
        </form>
      )}

      {/* 类型筛选 */}
      <div className="flex gap-1 mb-4">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-sm ${activeTab === tab ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {tab === 'all' ? '全部' : tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* 组件列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {components.map(comp => (
          <ComponentCard
            key={comp.id}
            component={comp}
            onToggle={handleToggle}
            onConfig={handleConfig}
          />
        ))}
      </div>
      {components.length === 0 && (
        <p className="text-center text-gray-400 py-12">暂无组件</p>
      )}

      {/* 配置弹窗 */}
      {configId && schema && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-auto">
            <h3 className="font-bold mb-4">组件配置</h3>
            <DynamicForm
              schema={schema}
              values={{}}
              onSubmit={async (values) => {
                await api.components.updateConfig(configId, values)
                setConfigId(null)
                setSchema(null)
                fetchComponents()
              }}
            />
            <button onClick={() => { setConfigId(null); setSchema(null) }} className="mt-3 text-sm text-gray-500">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

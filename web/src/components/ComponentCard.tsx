import StatusBadge from './StatusBadge'

export default function ComponentCard({
  component,
  onToggle,
  onConfig,
}: {
  component: any
  onToggle: (id: string, enabled: boolean) => void
  onConfig: (id: string) => void
}) {
  const typeColors: Record<string, string> = {
    skill: 'bg-purple-100 text-purple-700',
    hook: 'bg-orange-100 text-orange-700',
    mcp: 'bg-teal-100 text-teal-700',
    rule: 'bg-indigo-100 text-indigo-700',
  }

  return (
    <div className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-sm">{component.name}</h3>
            <span className={`px-1.5 py-0.5 rounded text-xs ${typeColors[component.type]}`}>
              {component.type}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-2">{component.description}</p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>v{component.version}</span>
            {component.author && <span>· {component.author}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={component.installed ? (component.enabled ? 'completed' : 'failed') : 'pending'} />
        </div>
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t">
        <button
          onClick={() => onToggle(component.id, !component.enabled)}
          className={`px-3 py-1 rounded text-xs ${component.enabled ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
        >
          {component.enabled ? '禁用' : '启用'}
        </button>
        <button
          onClick={() => onConfig(component.id)}
          className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
        >
          配置
        </button>
      </div>
    </div>
  )
}

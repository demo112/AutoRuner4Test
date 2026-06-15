import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'

const KNOWLEDGE_TYPES = [
  { value: '', label: '全部' },
  { value: 'pattern', label: '模式' },
  { value: 'lesson', label: '教训' },
  { value: 'defect_pattern', label: '缺陷模式' },
  { value: 'script_template', label: '脚本模板' },
]

function RelatedKnowledge({ itemId }: { itemId: string }) {
  const [related, setRelated] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.knowledge.getRelated(itemId)
      .then(({ related: r }) => setRelated(r))
      .finally(() => setLoading(false))
  }, [itemId])

  if (loading) return <p className="text-xs text-gray-400">加载中...</p>
  if (related.length === 0) return <p className="text-xs text-gray-400">暂无关联</p>

  return (
    <div className="space-y-1">
      {related.map(r => (
        <div key={r.id} className="flex items-center justify-between text-xs">
          <span className="truncate">{r.id.slice(0, 8)}</span>
          <span className="text-gray-400 ml-2">{r.relation} ({(r.strength * 100).toFixed(0)}%)</span>
        </div>
      ))}
    </div>
  )
}

export default function KnowledgeBase() {
  const { knowledgeItems, fetchKnowledge } = useStore()
  const [filterType, setFilterType] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [distillStatus, setDistillStatus] = useState<{ unprocessed_count: number; needs_distillation: boolean } | null>(null)
  const [distilling, setDistilling] = useState(false)
  const [recommendations, setRecommendations] = useState<any[] | null>(null)

  useEffect(() => {
    fetchKnowledge(filterType || undefined)
  }, [filterType, fetchKnowledge])

  useEffect(() => {
    api.knowledge.distillStatus().then(setDistillStatus).catch(() => {})
  }, [distilling])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    const { items } = await api.knowledge.search(searchQuery)
    setSearchResults(items)
  }

  const handleDistill = async () => {
    setDistilling(true)
    try {
      const result = await api.knowledge.distill()
      alert(`蒸馏完成：${result.distilled} 条新知识`)
      fetchKnowledge(filterType || undefined)
    } finally {
      setDistilling(false)
    }
  }

  const handleBuildGraph = async () => {
    const result = await api.knowledge.buildGraph()
    alert(`图谱构建完成：${result.links_created} 条关联`)
  }

  const handleRecommend = async (type: string) => {
    const tags = selectedItem ? JSON.parse(selectedItem.tags || '[]') : []
    const result = await api.knowledge.recommend(type, tags)
    setRecommendations(result.recommendations)
  }

  const items = searchResults || knowledgeItems

  return (
    <div className="p-6 flex gap-6">
      {/* 左侧列表 */}
      <div className="w-2/3">
        <h2 className="text-xl font-bold mb-4">知识库</h2>

        {/* 蒸馏状态 */}
        {distillStatus && distillStatus.unprocessed_count > 0 && (
          <div className="mb-4 p-3 border rounded bg-amber-50 flex items-center justify-between">
            <span className="text-xs text-amber-700">
              {distillStatus.unprocessed_count} 条未蒸馏痕迹
              {distillStatus.needs_distillation && '（建议执行蒸馏）'}
            </span>
            <button
              onClick={handleDistill}
              disabled={distilling}
              className="px-3 py-1 bg-amber-600 text-white rounded text-xs disabled:opacity-50"
            >
              {distilling ? '蒸馏中...' : '执行蒸馏'}
            </button>
          </div>
        )}

        {/* 搜索 + 筛选 */}
        <div className="flex gap-2 mb-4">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜索知识..."
            className="flex-1 border rounded px-3 py-1.5 text-sm"
          />
          <button onClick={handleSearch} className="px-4 py-1.5 bg-black text-white rounded text-sm">搜索</button>
          {searchResults && (
            <button onClick={() => { setSearchResults(null); setSearchQuery('') }} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-sm">清除</button>
          )}
        </div>

        <div className="flex gap-1 mb-4">
          {KNOWLEDGE_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={`px-3 py-1 rounded text-sm ${filterType === t.value ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 条目列表 */}
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              onClick={async () => {
                const { item: detail } = await api.knowledge.get(item.id)
                setSelectedItem(detail)
                setRecommendations(null)
              }}
              className={`border rounded p-3 hover:bg-gray-50 cursor-pointer ${
                selectedItem?.id === item.id ? 'border-black' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  item.type === 'lesson' ? 'bg-orange-100 text-orange-700' :
                  item.type === 'pattern' ? 'bg-blue-100 text-blue-700' :
                  item.type === 'defect_pattern' ? 'bg-red-100 text-red-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {item.type}
                </span>
                <span className="text-sm font-medium">{item.title}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{new Date(item.created_at).toLocaleDateString()}</p>
            </div>
          ))}
          {items.length === 0 && <p className="text-center text-gray-400 py-12">暂无知识条目</p>}
        </div>
      </div>

      {/* 右侧详情 */}
      <div className="w-1/3">
        {selectedItem ? (
          <div className="border rounded-lg p-4 sticky top-6">
            <h3 className="font-bold text-lg mb-2">{selectedItem.title}</h3>
            <div className="flex gap-1 mb-3 flex-wrap">
              {JSON.parse(selectedItem.tags || '[]').map((tag: string) => (
                <span key={tag} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{tag}</span>
              ))}
            </div>
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded overflow-auto max-h-72">
                {selectedItem.content}
              </pre>
            </div>

            {/* 操作按钮 */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleRecommend(selectedItem.type)}
                className="px-3 py-1 bg-blue-500 text-white rounded text-xs"
              >
                推荐相关知识
              </button>
              <button
                onClick={handleBuildGraph}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs"
              >
                重建图谱
              </button>
            </div>

            {/* 关联知识 */}
            <div className="mt-4 p-3 border rounded">
              <h4 className="text-sm font-medium mb-2">关联知识</h4>
              <RelatedKnowledge itemId={selectedItem.id} />
            </div>

            {/* 推荐 */}
            {recommendations && recommendations.length > 0 && (
              <div className="mt-4 p-3 border rounded">
                <h4 className="text-sm font-medium mb-2">推荐知识</h4>
                <div className="space-y-2">
                  {recommendations.map((r: any, i: number) => (
                    <div key={i}>
                      <p className="text-xs text-gray-500 mb-1">{r.reason}</p>
                      {r.items.map((item: any) => (
                        <div key={item.id} className="text-xs border-l-2 border-blue-300 pl-2 py-1">
                          {item.title}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="border rounded-lg p-4 text-center text-gray-400">
            选择一个知识条目查看详情
          </div>
        )}
      </div>
    </div>
  )
}

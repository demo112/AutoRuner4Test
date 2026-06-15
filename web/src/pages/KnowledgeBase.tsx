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

export default function KnowledgeBase() {
  const { knowledgeItems, fetchKnowledge } = useStore()
  const [filterType, setFilterType] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [selectedItem, setSelectedItem] = useState<any>(null)

  useEffect(() => {
    fetchKnowledge(filterType || undefined)
  }, [filterType, fetchKnowledge])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    const { items } = await api.knowledge.search(searchQuery)
    setSearchResults(items)
  }

  const items = searchResults || knowledgeItems

  return (
    <div className="p-6 flex gap-6">
      {/* 左侧列表 */}
      <div className="w-2/3">
        <h2 className="text-xl font-bold mb-4">知识库</h2>

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
              }}
              className="border rounded p-3 hover:bg-gray-50 cursor-pointer"
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
            <div className="flex gap-1 mb-3">
              {JSON.parse(selectedItem.tags || '[]').map((tag: string) => (
                <span key={tag} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{tag}</span>
              ))}
            </div>
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded overflow-auto max-h-96">
                {selectedItem.content}
              </pre>
            </div>
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

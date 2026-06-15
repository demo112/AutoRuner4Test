import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import ReviewModal from '../components/ReviewModal'

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [task, setTask] = useState<any>(null)
  const [artifacts, setArtifacts] = useState<any[]>([])
  const [artifactContent, setArtifactContent] = useState<string | null>(null)
  const [showReview, setShowReview] = useState(false)

  const refresh = async () => {
    if (!id) return
    const { task: t } = await api.tasks.get(id)
    setTask(t)
    const { artifacts: a } = await api.tasks.getArtifacts(id)
    setArtifacts(a)
  }

  useEffect(() => { refresh() }, [id])

  if (!task) return <div className="p-6">加载中...</div>

  const typeLabels: Record<string, string> = {
    'requirement-analysis': '需求分析',
    'testcase-generation': '用例生成',
    'script-conversion': '脚本转换',
    'execution-analysis': '执行分析',
    'issue-triage': '提单处理',
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/tasks')} className="text-gray-400 hover:text-gray-600">← 返回</button>
        <h2 className="text-xl font-bold">{typeLabels[task.type] || task.type}</h2>
        <StatusBadge status={task.status} />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 mb-6">
        {task.status === 'pending' && (
          <button
            onClick={async () => { await api.tasks.start(task.id); refresh() }}
            className="px-4 py-1.5 bg-blue-500 text-white rounded text-sm"
          >
            启动
          </button>
        )}
        {task.status === 'review' && (
          <button
            onClick={() => setShowReview(true)}
            className="px-4 py-1.5 bg-yellow-500 text-white rounded text-sm"
          >
            确认/驳回
          </button>
        )}
        {task.status === 'failed' && (
          <button
            onClick={async () => { await api.tasks.retry(task.id); refresh() }}
            className="px-4 py-1.5 bg-gray-500 text-white rounded text-sm"
          >
            重试
          </button>
        )}
      </div>

      {/* 详情 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="border rounded p-3">
          <p className="text-xs text-gray-500">任务 ID</p>
          <p className="text-sm font-mono">{task.id}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-xs text-gray-500">创建时间</p>
          <p className="text-sm">{new Date(task.created_at).toLocaleString()}</p>
        </div>
      </div>

      {/* 产出物 */}
      {artifacts.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold mb-2">产出物</h3>
          <div className="space-y-2">
            {artifacts.map(a => (
              <div
                key={a.id}
                onClick={async () => {
                  const content = await api.tasks.getArtifact(task.id, a.id)
                  setArtifactContent(content.content)
                }}
                className="border rounded p-3 hover:bg-gray-50 cursor-pointer"
              >
                <span className="text-sm">{a.name}</span>
                <span className="text-xs text-gray-400 ml-2">{a.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 产出物内容 */}
      {artifactContent && (
        <div className="border rounded p-4 bg-gray-50">
          <div className="flex justify-between mb-2">
            <h3 className="font-bold">内容</h3>
            <button onClick={() => setArtifactContent(null)} className="text-xs text-gray-400">关闭</button>
          </div>
          <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-96">{artifactContent}</pre>
        </div>
      )}

      {/* 确认弹窗 */}
      {showReview && (
        <ReviewModal
          task={task}
          onClose={() => setShowReview(false)}
          onAction={() => { setShowReview(false); refresh() }}
        />
      )}
    </div>
  )
}

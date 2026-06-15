import { useNavigate } from 'react-router-dom'
import StatusBadge from './StatusBadge'

const typeLabels: Record<string, string> = {
  'requirement-analysis': '需求分析',
  'testcase-generation': '用例生成',
  'script-conversion': '脚本转换',
  'execution-analysis': '执行分析',
  'issue-triage': '提单处理',
}

export default function TaskCard({ task }: { task: any }) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/tasks/${task.id}`)}
      className="border rounded-lg p-4 hover:shadow-sm transition-shadow cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{typeLabels[task.type] || task.type}</span>
        <StatusBadge status={task.status} />
      </div>
      <div className="text-xs text-gray-400">
        <span>{new Date(task.created_at).toLocaleString()}</span>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import TaskCard from '../components/TaskCard'

const TASK_TYPES = [
  { value: 'requirement-analysis', label: '需求分析' },
  { value: 'testcase-generation', label: '用例生成' },
  { value: 'script-conversion', label: '脚本转换' },
  { value: 'execution-analysis', label: '执行分析' },
  { value: 'issue-triage', label: '提单处理' },
]

export default function TaskManager() {
  const { tasks, fetchTasks } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [filterType, setFilterType] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')

  useEffect(() => {
    fetchTasks(filterType || undefined, filterStatus || undefined)
  }, [filterType, filterStatus, fetchTasks])

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    await api.tasks.create({
      type: form.get('type'),
    })
    setShowCreate(false)
    fetchTasks()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">任务管理</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-1.5 bg-black text-white rounded text-sm">
          创建任务
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="border rounded-lg p-4 mb-4 bg-gray-50 space-y-3">
          <select name="type" className="border rounded px-2 py-1 text-sm w-full" required>
            <option value="">选择任务类型</option>
            {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button type="submit" className="px-4 py-1.5 bg-blue-500 text-white rounded text-sm">创建</button>
        </form>
      )}

      {/* 筛选 */}
      <div className="flex gap-2 mb-4">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">全部类型</option>
          {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">全部状态</option>
          <option value="pending">待执行</option>
          <option value="running">运行中</option>
          <option value="review">待确认</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tasks.map(task => <TaskCard key={task.id} task={task} />)}
      </div>
      {tasks.length === 0 && <p className="text-center text-gray-400 py-12">暂无任务</p>}
    </div>
  )
}

import { useEffect } from 'react'
import { useStore } from '../lib/store'
import { wsClient } from '../lib/ws'
import StatusBadge from '../components/StatusBadge'

export default function Dashboard() {
  const { tasks, fetchTasks, updateTaskStatus } = useStore()

  useEffect(() => {
    fetchTasks()
    wsClient.connect()

    const unsub = wsClient.onEvent((event, taskId, data) => {
      if (event === 'task:status-changed') {
        updateTaskStatus(taskId, data.to)
      }
    })

    return () => { unsub(); wsClient.disconnect() }
  }, [fetchTasks, updateTaskStatus])

  const running = tasks.filter(t => t.status === 'running')
  const reviewing = tasks.filter(t => t.status === 'review')
  const failed = tasks.filter(t => t.status === 'failed')

  const typeLabels: Record<string, string> = {
    'requirement-analysis': '需求分析',
    'testcase-generation': '用例生成',
    'script-conversion': '脚本转换',
    'execution-analysis': '执行分析',
    'issue-triage': '提单处理',
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6">运行监控</h2>

      {/* 状态概览 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border rounded-lg p-4 bg-blue-50">
          <p className="text-2xl font-bold text-blue-600">{running.length}</p>
          <p className="text-sm text-gray-600">运行中</p>
        </div>
        <div className="border rounded-lg p-4 bg-yellow-50">
          <p className="text-2xl font-bold text-yellow-600">{reviewing.length}</p>
          <p className="text-sm text-gray-600">待确认</p>
        </div>
        <div className="border rounded-lg p-4 bg-red-50">
          <p className="text-2xl font-bold text-red-600">{failed.length}</p>
          <p className="text-sm text-gray-600">失败</p>
        </div>
      </div>

      {/* 待确认任务（最紧急） */}
      {reviewing.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold mb-2 text-yellow-700">⚠ 待确认</h3>
          <div className="space-y-2">
            {reviewing.map(task => (
              <div key={task.id} className="border rounded p-3 flex items-center justify-between bg-yellow-50">
                <div>
                  <span className="text-sm font-medium">{typeLabels[task.type]}</span>
                  <span className="text-xs text-gray-400 ml-2">{task.id.slice(0, 8)}</span>
                </div>
                <StatusBadge status={task.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 运行中任务 */}
      {running.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold mb-2">🔄 运行中</h3>
          <div className="space-y-2">
            {running.map(task => (
              <div key={task.id} className="border rounded p-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{typeLabels[task.type]}</span>
                  <span className="text-xs text-gray-400 ml-2">{task.id.slice(0, 8)}</span>
                </div>
                <StatusBadge status={task.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最近任务 */}
      <div>
        <h3 className="font-bold mb-2">所有任务</h3>
        <div className="space-y-1">
          {tasks.slice(0, 20).map(task => (
            <div key={task.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-sm">{typeLabels[task.type]}</span>
                <span className="text-xs text-gray-400">{new Date(task.created_at).toLocaleString()}</span>
              </div>
              <StatusBadge status={task.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

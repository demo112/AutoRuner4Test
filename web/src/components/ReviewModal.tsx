import { api } from '../lib/api'

export default function ReviewModal({
  task,
  onClose,
  onAction,
}: {
  task: any
  onClose: () => void
  onAction: () => void
}) {
  const handleApprove = async () => {
    await api.tasks.approve(task.id)
    onAction()
  }

  const handleReject = async () => {
    await api.tasks.reject(task.id)
    onAction()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[600px] max-h-[80vh] overflow-auto">
        <h3 className="font-bold text-lg mb-2">人工确认</h3>
        <p className="text-sm text-gray-500 mb-4">任务 {task.id} 需要人工确认</p>

        {task.output_artifact_id && (
          <div className="border rounded p-3 bg-gray-50 mb-4 max-h-60 overflow-auto">
            <p className="text-xs text-gray-500 mb-1">产出物预览</p>
            <pre className="text-xs whitespace-pre-wrap">{task.output_artifact_id}</pre>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            className="px-4 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
          >
            ✅ 确认通过
          </button>
          <button
            onClick={handleReject}
            className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
          >
            ❌ 驳回
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded text-sm hover:bg-gray-200"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

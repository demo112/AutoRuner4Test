/**
 * task-state-hook
 * 任务状态变更时：更新 DB + WebSocket 通知前端
 */
module.exports = async function handleTaskStateChange(event) {
  const { taskId, from, to, timestamp } = event.data

  // 更新数据库
  const db = require('../../server/src/db/client')
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(to, timestamp || new Date().toISOString(), taskId)

  // WebSocket 通知
  if (event.config?.notify_frontend !== false) {
    const { broadcast } = require('../../server/src/ws/handler')
    broadcast({
      event: 'task:status-changed',
      taskId,
      data: { from, to },
    })
  }

  return { handled: true }
}

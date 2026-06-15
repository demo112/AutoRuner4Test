/**
 * review-request-hook
 * 任务状态变为 review 时，通知前端等待人工确认
 */
module.exports = async function handleReviewRequest(event) {
  const { taskId, to } = event.data

  if (to !== 'review') return { handled: false }

  const { broadcast } = require('../../server/src/ws/handler')
  broadcast({
    event: 'task:review-requested',
    taskId,
    data: { status: 'review', timestamp: new Date().toISOString() },
  })

  return { handled: true }
}

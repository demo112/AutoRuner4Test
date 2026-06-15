/**
 * knowledge-distill-hook
 * 产出物写入时检查未蒸馏痕迹数量，达阈值提醒
 */
module.exports = async function handleKnowledgeDistill(event) {
  const config = event.config || {}
  const threshold = config.threshold || 5

  const db = require('../../server/src/db/client')
  const count = db.prepare(
    'SELECT COUNT(*) as cnt FROM knowledge WHERE distilled = 0'
  ).get().cnt

  if (count >= threshold) {
    const { broadcast } = require('../../server/src/ws/handler')
    broadcast({
      event: 'knowledge:distill-needed',
      taskId: null,
      data: { unprocessed_count: count, threshold },
    })
  }

  return { handled: count >= threshold }
}

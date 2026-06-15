import { getDb } from '../db/client'

/**
 * 基于任务类型和标签推荐相关知识
 */
export function recommendKnowledge(taskType: string, tags: string[]): { items: any[]; reason: string }[] {
  const db = getDb()
  const results: { items: any[]; reason: string }[] = []

  // 按任务类型匹配
  if (taskType) {
    const typeItems = db.prepare(
      "SELECT * FROM knowledge WHERE content LIKE ? OR title LIKE ? LIMIT 5"
    ).all(`%${taskType}%`, `%${taskType}%`) as any[]

    if (typeItems.length > 0) {
      results.push({ items: typeItems, reason: `与任务类型 "${taskType}" 相关` })
    }
  }

  // 按标签匹配
  for (const tag of tags.slice(0, 5)) {
    const tagItems = db.prepare(
      "SELECT * FROM knowledge WHERE EXISTS (SELECT 1 FROM json_each(tags) WHERE json_each.value = ?) LIMIT 3"
    ).all(tag) as any[]
    if (tagItems.length > 0) {
      results.push({ items: tagItems, reason: `标签 "${tag}" 匹配` })
    }
  }

  // 去重
  const seen = new Set<string>()
  return results.map(r => ({
    ...r,
    items: r.items.filter(item => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    }),
  })).filter(r => r.items.length > 0)
}

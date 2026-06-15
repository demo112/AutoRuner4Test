import { getDb } from '../db/client'

interface KnowledgeLink {
  source_id: string
  target_id: string
  relation_type: 'related' | 'causes' | 'solves' | 'refines'
  strength: number
}

/**
 * 知识图谱：基于标签重叠建立关联
 */
export function buildLinks(): { links_created: number } {
  const db = getDb()

  // 读取所有知识条目的标签
  const items = db.prepare('SELECT id, tags FROM knowledge').all() as { id: string; tags: string }[]

  interface TagItem { id: string; tagSet: Set<string> }
  const parsed: TagItem[] = items.map(item => ({
    id: item.id,
    tagSet: new Set<string>(JSON.parse(item.tags || '[]')),
  }))

  // 基于标签重叠计算关联
  const links: KnowledgeLink[] = []
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const overlap = [...parsed[i].tagSet].filter(t => parsed[j].tagSet.has(t)).length
      if (overlap >= 2) {
        const strength = overlap / Math.max(parsed[i].tagSet.size, parsed[j].tagSet.size)
        links.push({
          source_id: parsed[i].id,
          target_id: parsed[j].id,
          relation_type: 'related',
          strength,
        })
      }
    }
  }

  // 重建关联表
  db.prepare('DELETE FROM knowledge_links').run()
  const stmt = db.prepare(
    'INSERT INTO knowledge_links (source_id, target_id, relation_type, strength) VALUES (?, ?, ?, ?)'
  )
  for (const link of links) {
    stmt.run(link.source_id, link.target_id, link.relation_type, link.strength)
  }

  return { links_created: links.length }
}

export function getRelated(id: string): { id: string; relation: string; strength: number }[] {
  const db = getDb()
  return db.prepare(
    `SELECT target_id as id, relation_type as relation, strength FROM knowledge_links WHERE source_id = ?
     UNION
     SELECT source_id as id, relation_type as relation, strength FROM knowledge_links WHERE target_id = ?`
  ).all(id, id) as { id: string; relation: string; strength: number }[]
}

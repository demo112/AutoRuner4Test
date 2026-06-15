import fs from 'fs'
import path from 'path'
import { getDb } from '../db/client'

const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || path.join(process.cwd(), 'data', 'knowledge')

interface DistillResult {
  title: string
  type: 'pattern' | 'lesson' | 'defect_pattern' | 'script_template'
  tags: string[]
  content: string
  confidence: number
  source_task: string
}

/**
 * 蒸馏管道：从任务痕迹中提炼可复用知识
 * 1. 查询已完成的任务（无对应知识条目的）
 * 2. 按任务类型推断知识类型
 * 3. 生成基础知识条目
 * 4. 写入知识库
 */
export function runDistillation(taskId?: string): { distilled: number; items: DistillResult[] } {
  const db = getDb()

  // 查找已完成的任务，且尚无关联知识条目
  let tasks: { id: string; type: string; error_message: string | null; created_at: string }[]
  if (taskId) {
    tasks = db.prepare(
      "SELECT id, type, error_message, created_at FROM tasks WHERE id = ? AND status IN ('completed', 'failed')"
    ).all(taskId) as typeof tasks
  } else {
    tasks = db.prepare(
      `SELECT id, type, error_message, created_at FROM tasks
       WHERE status IN ('completed', 'failed')
       AND id NOT IN (SELECT DISTINCT source_task_id FROM knowledge WHERE source_task_id IS NOT NULL)
       ORDER BY updated_at DESC LIMIT 50`
    ).all() as typeof tasks
  }

  if (tasks.length === 0) return { distilled: 0, items: [] }

  const results: DistillResult[] = []

  for (const task of tasks) {
    const item: DistillResult = {
      title: `${inferLabel(task.type)}经验 - ${task.id.slice(0, 8)}`,
      type: inferType(task.type, task.error_message),
      tags: [task.type, 'auto-distilled'],
      content: buildContent(task),
      confidence: task.error_message ? 0.7 : 0.5,
      source_task: task.id,
    }
    results.push(item)
  }

  // 写入知识库
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true })
  for (const item of results) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const tagsJson = JSON.stringify(item.tags)

    db.prepare(`
      INSERT INTO knowledge (id, type, source_task_id, title, content, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, item.type, item.source_task, item.title, item.content, tagsJson, now, now)

    // 同步写 Obsidian 文件
    const frontmatter = [
      '---',
      `type: ${item.type}`,
      `source_task: ${item.source_task}`,
      `tags: [${item.tags.join(', ')}]`,
      `created: ${now}`,
      `confidence: ${item.confidence}`,
      `distilled: 1`,
      '---',
      '',
      item.content,
    ].join('\n')
    fs.writeFileSync(path.join(KNOWLEDGE_DIR, `${id}.md`), frontmatter, 'utf-8')
  }

  return { distilled: results.length, items: results }
}

export function getUnprocessedCount(): number {
  const db = getDb()
  const row = db.prepare(
    `SELECT COUNT(*) as cnt FROM tasks
     WHERE status IN ('completed', 'failed')
     AND id NOT IN (SELECT DISTINCT source_task_id FROM knowledge WHERE source_task_id IS NOT NULL)`
  ).get() as { cnt: number }
  return row.cnt
}

function inferType(taskType: string, errorMessage: string | null): DistillResult['type'] {
  if (errorMessage) return 'defect_pattern'
  if (taskType.includes('analysis') || taskType.includes('pattern')) return 'pattern'
  if (taskType.includes('script') || taskType.includes('conversion')) return 'script_template'
  return 'lesson'
}

function inferLabel(taskType: string): string {
  const labels: Record<string, string> = {
    'requirement-analysis': '需求分析',
    'testcase-generation': '用例生成',
    'script-conversion': '脚本转换',
    'execution-analysis': '执行分析',
    'issue-triage': '问题分拣',
  }
  return labels[taskType] || taskType
}

function buildContent(task: { id: string; type: string; error_message: string | null }): string {
  const lines = [
    `## ${inferLabel(task.type)}经验`,
    '',
    `任务 ${task.id.slice(0, 8)} 执行过程的自动化蒸馏结果`,
    '',
  ]
  if (task.error_message) {
    lines.push('## 错误信息', task.error_message, '')
  }
  lines.push('## 根因', '待人工补充', '', '## 解法', '待人工补充', '', '## 适用场景', '待人工补充')
  return lines.join('\n')
}

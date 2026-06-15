// Set env vars BEFORE importing modules that read them at module level
import fs from 'fs'
import path from 'path'
import os from 'os'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoruner-test-'))
process.env.DB_PATH = ':memory:'
process.env.KNOWLEDGE_DIR = path.join(tmpDir, 'knowledge')

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { getDb, closeDb } from '../db/client'
import { migrate } from '../db/migrate'
import { installComponent, listComponents, uninstallComponent } from '../services/component-registry'
import { createTask, startTask, approveTask, rejectTask, retryTask } from '../services/task-runner'
import { createKnowledge, searchKnowledge } from '../services/knowledge-store'

// All tests share one in-memory DB; use descriptive assertions instead of exact counts

describe('Integration: Component Registry', () => {
  beforeAll(() => {
    migrate()
  })

  afterAll(() => {
    closeDb()
  })

  test('install and list components', () => {
    const beforeCount = listComponents('skill').length
    const comp = installComponent({
      name: 'requirement-analysis-test',
      type: 'skill',
      source: './skills/requirement-analysis',
      description: '解析需求文档',
    })
    expect(comp.id).toBeDefined()
    expect(comp.installed).toBe(1)

    const afterAll = listComponents()
    expect(afterAll.length).toBe(beforeCount + 1)

    const skills = listComponents('skill')
    expect(skills.length).toBe(beforeCount + 1)
    expect(skills.some(s => s.name === 'requirement-analysis-test')).toBe(true)
  })

  test('uninstall component', () => {
    const comp = installComponent({
      name: 'hook-test-uninstall',
      type: 'hook',
      source: './hooks/test',
      description: '测试卸载',
    })
    const beforeInstalled = listComponents(undefined, true).length

    const ok = uninstallComponent(comp.id)
    expect(ok).toBe(true)

    const afterInstalled = listComponents(undefined, true)
    expect(afterInstalled.length).toBe(beforeInstalled - 1)
    expect(afterInstalled.some(c => c.id === comp.id)).toBe(false)
  })
})

describe('Integration: Task lifecycle', () => {
  test('create -> start -> review -> approve -> completed', () => {
    const task = createTask({ type: 'requirement-analysis' })
    expect(task.status).toBe('pending')

    const started = startTask(task.id)
    if ('error' in started) throw new Error(started.error)
    expect(started.status).toBe('running')

    // Simulate worker setting task to review status
    const db = getDb()
    db.prepare("UPDATE tasks SET status = 'review', updated_at = datetime('now') WHERE id = ?").run(task.id)

    const approved = approveTask(task.id)
    if ('error' in approved) throw new Error(approved.error)
    expect(approved.status).toBe('completed')
  })

  test('create -> reject -> retry', () => {
    const task = createTask({ type: 'requirement-analysis' })
    startTask(task.id)

    const db = getDb()
    db.prepare("UPDATE tasks SET status = 'review', updated_at = datetime('now') WHERE id = ?").run(task.id)

    const rejected = rejectTask(task.id)
    if ('error' in rejected) throw new Error(rejected.error)
    expect(rejected.status).toBe('failed')

    const retried = retryTask(task.id)
    if ('error' in retried) throw new Error(retried.error)
    expect(retried.status).toBe('pending')
  })
})

describe('Integration: Knowledge base', () => {
  test('create and search knowledge', () => {
    const uniqueTitle = `登录边界值测试_${Date.now()}`
    const item = createKnowledge({
      type: 'lesson',
      title: uniqueTitle,
      content: '密码长度边界需测试0、1、6、7、128字符',
      tags: ['login', 'boundary'],
    })
    expect(item.id).toBeDefined()

    const results = searchKnowledge(uniqueTitle)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some(r => r.title === uniqueTitle)).toBe(true)
  })
})

afterAll(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

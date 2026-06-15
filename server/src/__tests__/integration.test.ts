// Set env vars BEFORE importing modules that read them at module level
process.env.DB_PATH = ':memory:'
process.env.KNOWLEDGE_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'autoruner-test-'))

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { getDb, closeDb } from '../db/client'
import { migrate } from '../db/migrate'
import { installComponent, listComponents, uninstallComponent } from '../services/component-registry'
import { createTask, getTask, startTask, approveTask, rejectTask, retryTask } from '../services/task-runner'
import { createKnowledge, searchKnowledge } from '../services/knowledge-store'

describe('Integration: Component Registry', () => {
  beforeAll(() => {
    migrate()
  })

  afterAll(() => {
    closeDb()
  })

  test('install and list components', () => {
    const comp = installComponent({
      name: 'requirement-analysis',
      type: 'skill',
      source: './skills/requirement-analysis',
      description: '解析需求文档',
    })
    expect(comp.id).toBeDefined()
    expect(comp.installed).toBe(1)

    const all = listComponents()
    expect(all.length).toBe(1)

    const skills = listComponents('skill')
    expect(skills.length).toBe(1)
  })

  test('uninstall component', () => {
    const comps = listComponents()
    const id = comps[0].id
    const ok = uninstallComponent(id)
    expect(ok).toBe(true)

    const updated = listComponents(undefined, true)
    expect(updated.length).toBe(0)
  })
})

describe('Integration: Task lifecycle', () => {
  beforeAll(() => {
    migrate()
  })

  afterAll(() => {
    closeDb()
  })

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
  beforeAll(() => {
    migrate()
  })

  afterAll(() => {
    closeDb()
  })

  test('create and search knowledge', () => {
    const item = createKnowledge({
      type: 'lesson',
      title: '登录接口边界值',
      content: '密码长度边界需测试0、1、6、7、128字符',
      tags: ['login', 'boundary'],
    })
    expect(item.id).toBeDefined()

    const results = searchKnowledge('登录')
    expect(results.length).toBe(1)
    expect(results[0].title).toBe('登录接口边界值')
  })
})

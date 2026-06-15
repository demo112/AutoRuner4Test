import { Worker, Job } from 'bullmq'
import { getDb } from '../db/client'
import { getArtifact, saveArtifact } from '../services/artifact-store'
import { startClaudeInstance, getInstanceStatus, canStartInstance } from '../services/claude-instance'

const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379

// 轮询等待实例完成
function waitForInstance(instanceId: string, timeoutMs = 600_000): Promise<{ stdout: string; stderr: string; status: string }> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const interval = setInterval(() => {
      const instance = getInstanceStatus(instanceId)
      if (!instance) {
        clearInterval(interval)
        reject(new Error(`Instance ${instanceId} not found`))
        return
      }
      if (instance.status === 'completed' || instance.status === 'failed') {
        clearInterval(interval)
        resolve({ stdout: instance.stdout, stderr: instance.stderr, status: instance.status })
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval)
        reject(new Error(`Instance ${instanceId} timed out`))
      }
    }, 2000)
  })
}

export function createWorker(): Worker {
  const worker = new Worker('tasks', async (job: Job) => {
    const { taskId, taskType, componentIds, config, inputArtifactId } = job.data

    // 获取组件信息
    const db = getDb()
    const components = componentIds.length > 0
      ? db.prepare(`SELECT * FROM components WHERE id IN (${componentIds.map(() => '?').join(',')}) AND installed = 1`).all(...componentIds) as any[]
      : []

    // 获取输入产出物内容
    let inputContent: string | undefined
    if (inputArtifactId) {
      const artifact = getArtifact(inputArtifactId)
      inputContent = artifact?.content
    }

    // 等待实例槽位
    while (!canStartInstance()) {
      await new Promise(r => setTimeout(r, 5000))
    }

    // 启动 Claude Code 实例
    const result = startClaudeInstance(
      taskId,
      taskType,
      components.map(c => ({ type: c.type, name: c.name, source: c.source })),
      config,
      inputContent,
    )

    if (result.error) {
      throw new Error(result.error)
    }

    // 更新任务状态为 running
    db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run('running', new Date().toISOString(), taskId)

    // 等待完成
    const instanceResult = await waitForInstance(result.instanceId)

    if (instanceResult.status === 'completed') {
      // 保存产出物
      const artifactId = saveArtifact(taskId, `${taskType}-output.md`, taskType, instanceResult.stdout)

      // 检查是否需要人工确认
      const typeConfig: Record<string, boolean> = {
        'requirement-analysis': true,
        'testcase-generation': false,
        'script-conversion': false,
        'execution-analysis': true,
        'issue-triage': true,
      }
      const needsReview = typeConfig[taskType] ?? false

      const newStatus = needsReview ? 'review' : 'completed'
      db.prepare('UPDATE tasks SET status = ?, output_artifact_id = ?, updated_at = ? WHERE id = ?')
        .run(newStatus, artifactId, new Date().toISOString(), taskId)
    } else {
      db.prepare('UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE id = ?')
        .run('failed', instanceResult.stderr, new Date().toISOString(), taskId)
    }
  }, {
    connection: { host: REDIS_HOST, port: REDIS_PORT },
    concurrency: 1,
  })

  worker.on('failed', (job, err) => {
    console.error(`Task ${job?.data.taskId} failed:`, err.message)
  })

  return worker
}

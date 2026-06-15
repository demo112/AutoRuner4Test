import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

const WORK_DIR_BASE = process.env.WORK_DIR_BASE || path.join(process.cwd(), 'data', 'workdirs')
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_INSTANCES) || 3

interface ClaudeInstance {
  id: string
  taskId: string
  process: ChildProcess | null
  workDir: string
  status: 'starting' | 'running' | 'completed' | 'failed'
  stdout: string
  stderr: string
  startedAt: string
  completedAt: string | null
}

const activeInstances = new Map<string, ClaudeInstance>()

// 为任务组装 .claude 目录
function assembleClaudeConfig(
  workDir: string,
  components: Array<{ type: string; name: string; source: string }>,
  config: Record<string, any>,
): void {
  const claudeDir = path.join(workDir, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(claudeDir, 'hooks'), { recursive: true })

  const hooks: any[] = []
  const mcps: Record<string, any> = {}
  let rulesContent = ''

  for (const comp of components) {
    if (comp.type === 'skill') {
      if (comp.source && fs.existsSync(comp.source)) {
        const dest = path.join(claudeDir, 'skills', comp.name)
        if (!fs.existsSync(dest)) {
          fs.cpSync(comp.source, dest, { recursive: true })
        }
      }
    } else if (comp.type === 'hook') {
      hooks.push({ name: comp.name, source: comp.source })
    } else if (comp.type === 'mcp') {
      mcps[comp.name] = config[comp.name] || {}
    } else if (comp.type === 'rule') {
      rulesContent += `\n<!-- Rule: ${comp.name} -->\n${config[comp.name] || ''}\n`
    }
  }

  const settings: any = {}
  if (Object.keys(mcps).length > 0) {
    settings.mcpServers = mcps
  }
  if (hooks.length > 0) {
    settings.hooks = hooks
  }
  if (Object.keys(settings).length > 0) {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2))
  }

  if (rulesContent) {
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), rulesContent)
  }
}

// 构建任务指令 prompt
function buildTaskPrompt(taskType: string, config: Record<string, any>, inputContent?: string): string {
  const prompts: Record<string, string> = {
    'requirement-analysis': `请分析以下需求文档，识别功能点、边界条件和隐含约束。输出结构化的需求分析结果。\n\n${inputContent || '请提供需求文档内容。'}`,
    'testcase-generation': `请根据以下结构化需求，生成测试用例。使用等价类划分、边界值分析等方法。\n\n${inputContent || '请提供结构化需求。'}`,
    'script-conversion': `请将以下测试用例转换为自动化测试脚本。\n\n${inputContent || '请提供测试用例。'}`,
    'execution-analysis': `请分析以下测试执行报告，识别失败根因并分类（环境问题/代码缺陷/用例问题）。\n\n${inputContent || '请提供测试报告。'}`,
    'issue-triage': `请根据以下问题分析结果，生成缺陷描述并判断是否需要提单。\n\n${inputContent || '请提供问题分析结果。'}`,
  }
  return prompts[taskType] || '请执行任务。'
}

export function canStartInstance(): boolean {
  return activeInstances.size < MAX_CONCURRENT
}

export function getActiveCount(): number {
  return activeInstances.size
}

export function startClaudeInstance(
  taskId: string,
  taskType: string,
  components: Array<{ type: string; name: string; source: string }>,
  config: Record<string, any>,
  inputContent?: string,
): { instanceId: string; error?: string } {
  if (!canStartInstance()) {
    return { instanceId: '', error: `Max concurrent instances (${MAX_CONCURRENT}) reached` }
  }

  const instanceId = crypto.randomUUID()
  const workDir = path.join(WORK_DIR_BASE, taskId)
  fs.mkdirSync(workDir, { recursive: true })

  assembleClaudeConfig(workDir, components, config)

  if (inputContent) {
    fs.writeFileSync(path.join(workDir, 'input.md'), inputContent)
  }

  const prompt = buildTaskPrompt(taskType, config, inputContent)

  const instance: ClaudeInstance = {
    id: instanceId,
    taskId,
    process: null,
    workDir,
    status: 'starting',
    stdout: '',
    stderr: '',
    startedAt: new Date().toISOString(),
    completedAt: null,
  }

  const args = ['--print', '-p', prompt, '--output-format', 'json']
  const proc = spawn('claude', args, {
    cwd: workDir,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  instance.process = proc
  instance.status = 'running'

  proc.stdout?.on('data', (data: Buffer) => {
    instance.stdout += data.toString()
  })

  proc.stderr?.on('data', (data: Buffer) => {
    instance.stderr += data.toString()
  })

  proc.on('close', (code) => {
    instance.status = code === 0 ? 'completed' : 'failed'
    instance.completedAt = new Date().toISOString()
    instance.process = null
  })

  activeInstances.set(instanceId, instance)
  return { instanceId }
}

export function getInstanceStatus(instanceId: string): ClaudeInstance | undefined {
  return activeInstances.get(instanceId)
}

export function getInstancesByTask(taskId: string): ClaudeInstance[] {
  return Array.from(activeInstances.values()).filter(i => i.taskId === taskId)
}

export function stopInstance(instanceId: string): boolean {
  const instance = activeInstances.get(instanceId)
  if (!instance || !instance.process) return false
  instance.process.kill('SIGTERM')
  instance.status = 'failed'
  instance.completedAt = new Date().toISOString()
  return true
}

export function cleanupCompleted(): number {
  let count = 0
  for (const [id, instance] of activeInstances) {
    if (instance.status === 'completed' || instance.status === 'failed') {
      activeInstances.delete(id)
      count++
    }
  }
  return count
}

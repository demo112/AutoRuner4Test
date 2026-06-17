import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { moduleLogger } from './logger'

const log = moduleLogger('claude-instance')

const WORK_DIR_BASE = process.env.WORK_DIR_BASE || path.join(process.cwd(), 'data', 'workdirs')
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_INSTANCES) || 3
const MAX_OUTPUT_BYTES = Number(process.env.MAX_INSTANCE_OUTPUT_BYTES) || 1024 * 1024 // 1MB
const MAX_PROMPT_LENGTH = Number(process.env.MAX_PROMPT_LENGTH) || 100_000

interface ClaudeInstance {
  id: string
  taskId: string
  process: ChildProcess | null
  workDir: string
  status: 'starting' | 'running' | 'completed' | 'failed'
  stdout: string
  stderr: string
  outputTruncated: boolean
  startedAt: string
  completedAt: string | null
}

function validateTaskId(taskId: string): void {
  if (taskId.includes('..') || taskId.includes('/') || taskId.includes('\\')) {
    throw new Error('Invalid taskId: must not contain path traversal characters')
  }
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
    log.warn('Max concurrent instances reached', { max: MAX_CONCURRENT })
    return { instanceId: '', error: `Max concurrent instances (${MAX_CONCURRENT}) reached` }
  }

  validateTaskId(taskId)

  const instanceId = crypto.randomUUID()
  const workDir = path.join(WORK_DIR_BASE, taskId)
  fs.mkdirSync(workDir, { recursive: true })

  assembleClaudeConfig(workDir, components, config)

  if (inputContent) {
    fs.writeFileSync(path.join(workDir, 'input.md'), inputContent)
  }

  const prompt = buildTaskPrompt(taskType, config, inputContent)
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { instanceId: '', error: `Prompt exceeds maximum length (${MAX_PROMPT_LENGTH} chars)` }
  }

  const instance: ClaudeInstance = {
    id: instanceId,
    taskId,
    process: null,
    workDir,
    status: 'starting',
    stdout: '',
    stderr: '',
    outputTruncated: false,
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
    if (Buffer.byteLength(instance.stdout, 'utf-8') < MAX_OUTPUT_BYTES) {
      instance.stdout += data.toString()
    } else if (!instance.outputTruncated) {
      instance.outputTruncated = true
    }
  })

  proc.stderr?.on('data', (data: Buffer) => {
    if (Buffer.byteLength(instance.stderr, 'utf-8') < MAX_OUTPUT_BYTES) {
      instance.stderr += data.toString()
    } else if (!instance.outputTruncated) {
      instance.outputTruncated = true
    }
  })

  proc.on('close', (code) => {
    instance.status = code === 0 ? 'completed' : 'failed'
    instance.completedAt = new Date().toISOString()
    instance.process = null
    const duration = Date.now() - new Date(instance.startedAt).getTime()
    if (code === 0) {
      log.info('Claude instance completed', { instanceId, taskId: instance.taskId, duration })
    } else {
      log.error('Claude instance failed', { instanceId, taskId: instance.taskId, exitCode: code, duration })
    }
  })

  activeInstances.set(instanceId, instance)
  log.info('Claude instance started', { instanceId, taskId, taskType })
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
  // Don't set status here — the 'close' handler will set final status
  // After 5s, force kill if process hasn't exited
  const pid = instance.process.pid
  setTimeout(() => {
    try { process.kill(pid!, 'SIGKILL') } catch { /* already exited */ }
  }, 5000)
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

// ── V2: Workspace .claude/ directory assembly ─────────

export function assembleWorkspaceClaudeDir(
  workDir: string,
  template: { claude_md: string; skills: Array<{ component_id: string }>; hooks: Array<{ event: string; matcher?: string; command: string }>; mcp_servers: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>; rules: Array<{ component_id: string }> },
  componentResolver?: (componentId: string) => { type: string; content: string; file_name?: string } | null
): void {
  const claudeDir = path.join(workDir, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })

  // CLAUDE.md — write directly from template
  fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), template.claude_md, 'utf-8')

  // Skills — copy from component registry if resolver provided
  if (template.skills.length > 0 && componentResolver) {
    const skillsDir = path.join(claudeDir, 'skills')
    fs.mkdirSync(skillsDir, { recursive: true })
    for (const skill of template.skills) {
      const comp = componentResolver(skill.component_id)
      if (comp && comp.type === 'skill') {
        const fileName = comp.file_name || `${skill.component_id}.md`
        fs.writeFileSync(path.join(skillsDir, fileName), comp.content, 'utf-8')
      }
    }
  }

  // Rules — copy from component registry if resolver provided
  if (template.rules.length > 0 && componentResolver) {
    const rulesDir = path.join(claudeDir, 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    for (const rule of template.rules) {
      const comp = componentResolver(rule.component_id)
      if (comp && comp.type === 'rule') {
        const fileName = comp.file_name || `${rule.component_id}.md`
        fs.writeFileSync(path.join(rulesDir, fileName), comp.content, 'utf-8')
      }
    }
  }

  // settings.json — hooks + mcpServers
  const settings: Record<string, unknown> = {}
  if (template.hooks.length > 0) {
    const hooksConfig: Record<string, Array<Record<string, unknown>>> = {}
    for (const hook of template.hooks) {
      if (!hooksConfig[hook.event]) {
        hooksConfig[hook.event] = []
      }
      hooksConfig[hook.event].push({
        matcher: hook.matcher || '',
        hooks: [{ type: 'command', command: hook.command }],
      })
    }
    settings.hooks = hooksConfig
  }
  if (template.mcp_servers.length > 0) {
    const mcpConfig: Record<string, unknown> = {}
    for (const mcp of template.mcp_servers) {
      mcpConfig[mcp.name] = {
        command: mcp.command,
        ...(mcp.args && { args: mcp.args }),
        ...(mcp.env && { env: mcp.env }),
      }
    }
    settings.mcpServers = mcpConfig
  }
  if (Object.keys(settings).length > 0) {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8')
  }
}

// ── V2: Segment prompt construction ──────────────────

export interface SegmentPromptParams {
  claudeMd: string
  input: Record<string, unknown>
  context: Record<string, unknown>
  segmentIndex: number
  totalSegments: number
  reviewFeedback?: { result: 'approved' | 'rejected'; comment: string } | null
}

export function buildSegmentPrompt(params: SegmentPromptParams): string {
  const parts: string[] = []

  parts.push('## 你的任务')
  parts.push(params.claudeMd)
  parts.push('')

  parts.push('## 输入')
  parts.push(JSON.stringify(params.input, null, 2))
  parts.push('')

  if (Object.keys(params.context).length > 0) {
    parts.push('## 前序产出')
    parts.push(JSON.stringify(params.context, null, 2))
    parts.push('')
  }

  if (params.reviewFeedback && params.reviewFeedback.result === 'rejected') {
    parts.push('## 审核反馈')
    parts.push(`上一段产出被拒绝。原因：${params.reviewFeedback.comment}`)
    parts.push('请根据反馈修改后重新产出。')
    parts.push('')
  }

  parts.push(`## 执行进度`)
  parts.push(`当前段 ${params.segmentIndex + 1}/${params.totalSegments}`)

  return parts.join('\n')
}

// ── V2: Segment execution helpers ────────────────────

const SEGMENT_POLL_INTERVAL_MS = 2000
const SEGMENT_POLL_TIMEOUT_MS = 10 * 60 * 1000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseCliOutput(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.result && typeof parsed.result === 'string') {
      try { return JSON.parse(parsed.result) } catch { return parsed.result }
    }
    return parsed
  } catch {
    return raw.trim()
  }
}

export async function runClaudeSegment(workDir: string, prompt: string): Promise<{ success: boolean; output?: unknown; error?: string }> {
  const taskId = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  while (!canStartInstance()) {
    log.info('Waiting for free instance slot', { taskId })
    await sleep(SEGMENT_POLL_INTERVAL_MS)
  }

  const result = startClaudeInstance(taskId, 'workspace-segment', [], {}, prompt)
  if (result.error || !result.instanceId) {
    return { success: false, error: result.error || 'Failed to start instance' }
  }

  // Poll for completion
  const deadline = Date.now() + SEGMENT_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const inst = getInstanceStatus(result.instanceId)
    if (!inst) return { success: false, error: 'Instance not found' }
    if (inst.status === 'completed') {
      return { success: true, output: parseCliOutput(inst.stdout) }
    }
    if (inst.status === 'failed') {
      return { success: false, output: parseCliOutput(inst.stdout), error: inst.stderr || 'Process failed' }
    }
    await sleep(SEGMENT_POLL_INTERVAL_MS)
  }
  return { success: false, error: 'Segment execution timed out' }
}

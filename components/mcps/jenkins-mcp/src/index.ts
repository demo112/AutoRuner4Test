import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

// 配置从环境变量读取（由 Orchestrator 注入）
const JENKINS_URL = process.env.JENKINS_URL || ''
const JENKINS_USER = process.env.JENKINS_USERNAME || ''
const JENKINS_TOKEN = process.env.JENKINS_API_TOKEN || ''

function authHeaders(): Record<string, string> {
  const encoded = Buffer.from(`${JENKINS_USER}:${JENKINS_TOKEN}`).toString('base64')
  return { Authorization: `Basic ${encoded}` }
}

async function jenkinsFetch(path: string, opts?: RequestInit) {
  const url = `${JENKINS_URL}${path}`
  const res = await fetch(url, {
    ...opts,
    headers: { ...authHeaders(), ...opts?.headers },
  })
  if (!res.ok) throw new Error(`Jenkins API error: ${res.status} ${res.statusText}`)
  return res.json()
}

const server = new Server(
  { name: 'jenkins-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'trigger_build',
      description: '触发 Jenkins 构建',
      inputSchema: {
        type: 'object',
        properties: {
          job_name: { type: 'string', description: 'Job 名称' },
          parameters: { type: 'object', description: '构建参数' },
        },
        required: ['job_name'],
      },
    },
    {
      name: 'get_build_status',
      description: '查询构建状态',
      inputSchema: {
        type: 'object',
        properties: {
          job_name: { type: 'string' },
          build_number: { type: 'number' },
        },
        required: ['job_name', 'build_number'],
      },
    },
    {
      name: 'get_build_report',
      description: '获取构建测试报告',
      inputSchema: {
        type: 'object',
        properties: {
          job_name: { type: 'string' },
          build_number: { type: 'number' },
        },
        required: ['job_name', 'build_number'],
      },
    },
    {
      name: 'get_console_log',
      description: '获取构建控制台日志',
      inputSchema: {
        type: 'object',
        properties: {
          job_name: { type: 'string' },
          build_number: { type: 'number' },
          start: { type: 'number', description: '起始字节偏移' },
        },
        required: ['job_name', 'build_number'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'trigger_build': {
        const jobPath = args!.parameters
          ? `/job/${args!.job_name}/buildWithParameters?${new URLSearchParams(args!.parameters as Record<string, string>)}`
          : `/job/${args!.job_name}/build`
        const res = await fetch(`${JENKINS_URL}${jobPath}`, {
          method: 'POST',
          headers: authHeaders(),
        })
        const queueUrl = res.headers.get('Location')
        return {
          content: [{ type: 'text', text: JSON.stringify({ triggered: true, queue_url: queueUrl }) }],
        }
      }
      case 'get_build_status': {
        const data = await jenkinsFetch(`/job/${args!.job_name}/${args!.build_number}/api/json`)
        return {
          content: [{ type: 'text', text: JSON.stringify({ result: data.result, building: data.building, duration: data.duration, url: data.url }) }],
        }
      }
      case 'get_build_report': {
        const data = await jenkinsFetch(`/job/${args!.job_name}/${args!.build_number}/testReport/api/json`)
        return {
          content: [{ type: 'text', text: JSON.stringify(data) }],
        }
      }
      case 'get_console_log': {
        const startByte = (args!.start as number) || 0
        const res = await fetch(
          `${JENKINS_URL}/job/${args!.job_name}/${args!.build_number}/logText/progressiveText?start=${startByte}`,
          { headers: authHeaders() },
        )
        const text = await res.text()
        const moreData = res.headers.get('X-More-Data') === 'true'
        const newSize = res.headers.get('X-Text-Size')
        return {
          content: [{ type: 'text', text: JSON.stringify({ text, more_data: moreData, next_offset: newSize }) }],
        }
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)

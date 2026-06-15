import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const DEFECT_URL = process.env.DEFECT_URL || ''
const DEFECT_TOKEN = process.env.DEFECT_TOKEN || ''
const DEFECT_SYSTEM = process.env.DEFECT_SYSTEM || 'jira'
const PROJECT_KEY = process.env.DEFECT_PROJECT_KEY || ''

function headers(): Record<string, string> {
  if (DEFECT_SYSTEM === 'jira') {
    return { Authorization: `Bearer ${DEFECT_TOKEN}`, 'Content-Type': 'application/json' }
  }
  // Tapd
  return { Authorization: `Bearer ${DEFECT_TOKEN}`, 'Content-Type': 'application/json' }
}

async function defectFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${DEFECT_URL}${path}`, { ...opts, headers: { ...headers(), ...opts?.headers } })
  if (!res.ok) throw new Error(`Defect API error: ${res.status}`)
  return res.json()
}

const server = new Server(
  { name: 'defect-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_issue',
      description: '创建缺陷单',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '标题' },
          description: { type: 'string', description: '描述' },
          severity: { type: 'string', enum: ['blocker', 'critical', 'major', 'minor', 'trivial'] },
          type: { type: 'string', enum: ['bug', 'task', 'improvement'] },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'description', 'severity'],
      },
    },
    {
      name: 'update_issue',
      description: '更新缺陷单',
      inputSchema: {
        type: 'object',
        properties: {
          issue_key: { type: 'string' },
          status: { type: 'string' },
          comment: { type: 'string' },
        },
        required: ['issue_key'],
      },
    },
    {
      name: 'search_issues',
      description: '搜索缺陷',
      inputSchema: {
        type: 'object',
        properties: {
          jql: { type: 'string', description: 'JQL 或等效查询语句' },
          max_results: { type: 'number', default: 20 },
        },
        required: ['jql'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    switch (name) {
      case 'create_issue': {
        const body = DEFECT_SYSTEM === 'jira'
          ? { fields: { project: { key: PROJECT_KEY }, summary: args!.title, description: args!.description, issuetype: { name: args!.type || 'Bug' }, priority: { name: args!.severity }, labels: args!.labels || [] } }
          : { title: args!.title, description: args!.description, priority: args!.severity, category: args!.type || 'bug' }
        const data = await defectFetch('/rest/api/2/issue', { method: 'POST', body: JSON.stringify(body) })
        return { content: [{ type: 'text', text: JSON.stringify({ key: data.key || data.id, url: `${DEFECT_URL}/browse/${data.key || data.id}` }) }] }
      }
      case 'update_issue': {
        const body: any = {}
        if (args!.status) {
          if (DEFECT_SYSTEM === 'jira') body.transition = { id: args!.status }
          else body.status = args!.status
        }
        if (args!.comment) body.comment = args!.comment
        await defectFetch(`/rest/api/2/issue/${args!.issue_key}/transitions`, { method: 'POST', body: JSON.stringify(body) })
        return { content: [{ type: 'text', text: JSON.stringify({ updated: true }) }] }
      }
      case 'search_issues': {
        const data = await defectFetch(`/rest/api/2/search?jql=${encodeURIComponent(args!.jql)}&maxResults=${args!.max_results || 20}`)
        return { content: [{ type: 'text', text: JSON.stringify(data.issues?.map((i: any) => ({ key: i.key, summary: i.fields?.summary, status: i.fields?.status?.name })) || []) }] }
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

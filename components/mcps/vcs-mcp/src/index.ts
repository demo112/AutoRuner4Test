import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const REPO_PATH = process.env.VCS_REPO_PATH || process.cwd()

async function git(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: REPO_PATH })
  return stdout.trim()
}

const server = new Server(
  { name: 'vcs-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'status',
      description: '查看 Git 仓库状态',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'diff',
      description: '查看文件变更',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件路径（可选）' } },
      },
    },
    {
      name: 'commit_and_push',
      description: '提交并推送变更',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '提交信息' },
          files: { type: 'array', items: { type: 'string' }, description: '要提交的文件' },
          branch: { type: 'string', description: '目标分支' },
        },
        required: ['message'],
      },
    },
    {
      name: 'create_branch',
      description: '创建新分支',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          base: { type: 'string', description: '基于哪个分支' },
        },
        required: ['name'],
      },
    },
    {
      name: 'log',
      description: '查看提交历史',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', default: 10 },
          path: { type: 'string' },
        },
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    switch (name) {
      case 'status': {
        const output = await git('status', '--porcelain')
        return { content: [{ type: 'text', text: output || 'Clean working tree' }] }
      }
      case 'diff': {
        const diffArgs = args?.path ? ['diff', args.path as string] : ['diff']
        const output = await git(...diffArgs)
        return { content: [{ type: 'text', text: output || 'No changes' }] }
      }
      case 'commit_and_push': {
        if (args?.files?.length) {
          await git('add', ...(args.files as string[]))
        } else {
          await git('add', '-A')
        }
        await git('commit', '-m', args!.message as string)
        if (args?.branch) {
          await git('push', 'origin', args.branch as string)
        } else {
          await git('push')
        }
        return { content: [{ type: 'text', text: JSON.stringify({ committed: true, message: args!.message }) }] }
      }
      case 'create_branch': {
        const base = (args?.base as string) || 'HEAD'
        await git('checkout', '-b', args!.name as string, base)
        return { content: [{ type: 'text', text: JSON.stringify({ branch: args!.name, base }) }] }
      }
      case 'log': {
        const count = (args?.count as number) || 10
        const logArgs = args?.path
          ? ['log', `-${count}`, '--oneline', '--', args.path as string]
          : ['log', `-${count}`, '--oneline']
        const output = await git(...logArgs)
        return { content: [{ type: 'text', text: output }] }
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

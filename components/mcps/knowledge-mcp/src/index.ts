import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import fs from 'fs/promises'
import path from 'path'

const VAULT_PATH = process.env.KNOWLEDGE_VAULT_PATH || '/data/knowledge'

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function listKnowledge(type?: string) {
  await ensureDir(VAULT_PATH)
  const files = await fs.readdir(VAULT_PATH)
  const mdFiles = files.filter(f => f.endsWith('.md'))
  const items = []
  for (const file of mdFiles) {
    const content = await fs.readFile(path.join(VAULT_PATH, file), 'utf-8')
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (frontmatterMatch) {
      const fm: any = {}
      frontmatterMatch[1].split('\n').forEach(line => {
        const [key, ...rest] = line.split(':')
        if (key && rest.length) fm[key.trim()] = rest.join(':').trim()
      })
      if (type && fm.type !== type) continue
      items.push({
        id: file.replace('.md', ''),
        title: fm.title || file,
        type: fm.type || 'unknown',
        tags: fm.tags ? fm.tags.replace(/[\[\]]/g, '').split(',').map((s: string) => s.trim()) : [],
        created: fm.created || '',
        file,
      })
    }
  }
  return items
}

const server = new Server(
  { name: 'knowledge-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_note',
      description: '创建知识条目（Obsidian 格式）',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['pattern', 'lesson', 'defect_pattern', 'script_template'] },
          tags: { type: 'array', items: { type: 'string' } },
          content: { type: 'string', description: 'Markdown 正文（含四段：问题/根因/解法/适用场景）' },
          source_task: { type: 'string' },
        },
        required: ['title', 'type', 'content'],
      },
    },
    {
      name: 'read_note',
      description: '读取知识条目',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: '文件名（不含 .md）' } },
        required: ['id'],
      },
    },
    {
      name: 'search_notes',
      description: '全文搜索知识条目',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          type: { type: 'string', description: '按类型筛选' },
          max_results: { type: 'number', default: 10 },
        },
        required: ['query'],
      },
    },
    {
      name: 'update_note',
      description: '更新知识条目',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    switch (name) {
      case 'create_note': {
        await ensureDir(VAULT_PATH)
        const slug = args!.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9一-鿿-]/g, '')
        const filename = `${slug}.md`
        const frontmatter = [
          '---',
          `type: ${args!.type}`,
          `title: ${args!.title}`,
          `source_task: ${args!.source_task || ''}`,
          `tags: [${(args!.tags || []).join(', ')}]`,
          `created: ${new Date().toISOString().split('T')[0]}`,
          `distilled: 0`,
          '---',
          '',
          args!.content,
        ].join('\n')
        await fs.writeFile(path.join(VAULT_PATH, filename), frontmatter, 'utf-8')
        return { content: [{ type: 'text', text: JSON.stringify({ id: slug, file: filename }) }] }
      }
      case 'read_note': {
        const content = await fs.readFile(path.join(VAULT_PATH, `${args!.id}.md`), 'utf-8')
        return { content: [{ type: 'text', text: content }] }
      }
      case 'search_notes': {
        const items = await listKnowledge(args!.type as string)
        const query = (args!.query as string).toLowerCase()
        const results = []
        for (const item of items.slice(0, 50)) {
          const content = await fs.readFile(path.join(VAULT_PATH, item.file), 'utf-8')
          if (content.toLowerCase().includes(query)) {
            results.push({ id: item.id, title: item.title, type: item.type, tags: item.tags })
            if (results.length >= (args!.max_results as number || 10)) break
          }
        }
        return { content: [{ type: 'text', text: JSON.stringify(results) }] }
      }
      case 'update_note': {
        const filePath = path.join(VAULT_PATH, `${args!.id}.md`)
        let content = await fs.readFile(filePath, 'utf-8')
        if (args!.content) {
          // 保留 frontmatter，替换正文
          const fmMatch = content.match(/^(---\n[\s\S]*?\n---)\n/)
          content = fmMatch ? `${fmMatch[1]}\n${args!.content}` : args!.content as string
        }
        if (args!.tags) {
          content = content.replace(/tags: \[.*?\]/, `tags: [${(args!.tags as string[]).join(', ')}]`)
        }
        await fs.writeFile(filePath, content, 'utf-8')
        return { content: [{ type: 'text', text: JSON.stringify({ updated: true }) }] }
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

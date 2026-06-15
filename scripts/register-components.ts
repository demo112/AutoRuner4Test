/**
 * 批量注册组件到 Registry
 * 用法: bun run scripts/register-components.ts [api_url]
 */
import fs from 'fs'
import path from 'path'

const API_URL = process.argv[2] || 'http://localhost:3000/api'

interface Manifest {
  id: string
  name: string
  type: 'skill' | 'hook' | 'mcp' | 'rule'
  version: string
  description: string
  author: string
  config_schema: Record<string, any>
  dependencies: string[]
  source: string
}

const COMPONENTS_DIR = path.join(__dirname, '..', 'components')

async function registerComponent(type: string, name: string) {
  const manifestPath = path.join(COMPONENTS_DIR, type + 's', name, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    console.log(`  ⚠ 跳过 ${name}: manifest.json 不存在`)
    return
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const source = path.join(COMPONENTS_DIR, type + 's', name)

  try {
    const res = await fetch(`${API_URL}/components/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: manifest.name,
        type: manifest.type,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        config_schema: manifest.config_schema,
        dependencies: manifest.dependencies,
        source,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      console.log(`  ✅ ${name} v${manifest.version}`)
    } else {
      console.log(`  ❌ ${name}: ${data.error || res.statusText}`)
    }
  } catch (err: any) {
    console.log(`  ❌ ${name}: ${err.message}`)
  }
}

async function main() {
  console.log('注册组件到 Registry...')
  const types = ['skill', 'hook', 'mcp', 'rule']

  for (const type of types) {
    const dir = path.join(COMPONENTS_DIR, type + 's')
    if (!fs.existsSync(dir)) continue
    console.log(`\n[${type.toUpperCase()}]`)
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await registerComponent(type, entry.name)
      }
    }
  }
  console.log('\n完成！')
}

main()

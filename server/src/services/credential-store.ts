import crypto from 'crypto'
import { getDb } from '../db/client'
import { moduleLogger } from './logger'

const log = moduleLogger('credential-store')

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production'

function encrypt(text: string): string {
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(encryptedText: string): string {
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  const [ivHex, encrypted] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export class CredentialStore {
  save(componentId: string, keyName: string, value: string): void {
    const db = getDb()
    const id = `${componentId}:${keyName}`
    const encrypted = encrypt(value)

    db.prepare(`
      INSERT INTO credentials (id, component_id, key_name, encrypted_value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(component_id, key_name) DO UPDATE SET
        encrypted_value = excluded.encrypted_value,
        updated_at = datetime('now')
    `).run(id, componentId, keyName, encrypted)

    log.info('Credential saved', { componentId, keyName })
  }

  get(componentId: string, keyName: string): string | null {
    const db = getDb()
    const row = db.prepare(
      'SELECT encrypted_value FROM credentials WHERE component_id = ? AND key_name = ?',
    ).get(componentId, keyName) as { encrypted_value: string } | undefined

    if (!row) return null
    return decrypt(row.encrypted_value)
  }

  getAllForComponent(componentId: string): Record<string, string> {
    const db = getDb()
    const rows = db.prepare(
      'SELECT key_name, encrypted_value FROM credentials WHERE component_id = ?',
    ).all(componentId) as { key_name: string; encrypted_value: string }[]

    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key_name] = decrypt(row.encrypted_value)
    }
    return result
  }

  delete(componentId: string, keyName: string): void {
    const db = getDb()
    db.prepare('DELETE FROM credentials WHERE component_id = ? AND key_name = ?')
      .run(componentId, keyName)
    log.info('Credential deleted', { componentId, keyName })
  }
}

export const credentialStore = new CredentialStore()

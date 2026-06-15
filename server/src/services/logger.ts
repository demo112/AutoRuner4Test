type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const isDev = process.env.NODE_ENV !== 'production'
const minLevel = (process.env.LOG_LEVEL || 'info') as LogLevel

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel]
}

function formatMessage(level: LogLevel, msg: string, data?: Record<string, unknown>): string {
  const base = { level, ts: new Date().toISOString() }

  if (isDev) {
    const prefix = `${base.ts} [${level.toUpperCase()}]`
    if (data && Object.keys(data).length > 0) {
      return `${prefix} ${msg} ${JSON.stringify(data)}`
    }
    return `${prefix} ${msg}`
  }

  // 生产环境输出 JSON
  return JSON.stringify({ ...base, msg, ...data })
}

interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void
  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, data?: Record<string, unknown>): void
}

function createLogger(module: string, baseData?: Record<string, unknown>): Logger {
  const ctx = { module, ...baseData }

  function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    if (!shouldLog(level)) return
    const output = formatMessage(level, msg, { ...ctx, ...data })
    if (level === 'error') {
      console.error(output)
    } else if (level === 'warn') {
      console.warn(output)
    } else {
      console.log(output)
    }
  }

  return {
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
  }
}

/** 根 logger */
export const logger = createLogger('app')

/** 创建子 logger，附带模块上下文 */
export function moduleLogger(module: string, data?: Record<string, unknown>): Logger {
  return createLogger(module, data)
}

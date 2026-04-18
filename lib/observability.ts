export type LogLevel = 'info' | 'warn' | 'error'

export type StructuredLog = {
  level: LogLevel
  event: string
  message: string
  context?: Record<string, unknown>
  timestamp?: string
}

function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length > 8 && /(token|secret|password|authorization)/i.test(value)) {
      return '[REDACTED]'
    }
    return value
  }

  if (!value || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map(redactSecrets)
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([key, inner]) => {
    if (/(token|secret|password|authorization)/i.test(key)) {
      return [key, '[REDACTED]']
    }
    return [key, redactSecrets(inner)]
  })

  return Object.fromEntries(entries)
}

export function logStructured(log: StructuredLog) {
  const payload = {
    ...log,
    timestamp: log.timestamp ?? new Date().toISOString(),
    context: redactSecrets(log.context),
  }

  if (log.level === 'error') {
    console.error(JSON.stringify(payload))
    return
  }

  if (log.level === 'warn') {
    console.warn(JSON.stringify(payload))
    return
  }

  console.log(JSON.stringify(payload))
}

export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}
